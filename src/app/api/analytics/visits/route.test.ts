import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ visitor: vi.fn(), mutation: vi.fn(), capture: vi.fn(), coverage: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({
  requireSiteVisitor: mocks.visitor, assertWebMutation: mocks.mutation,
  authErrorResponse: (error: { status?: number }) => Response.json({ error: "refused" }, { status: error.status ?? 503 }),
}));
vi.mock("@/modules/analytics/policy", () => ({ visitCoverageStart: mocks.coverage }));
vi.mock("@/modules/analytics/visit-capture", async importOriginal => ({
  ...await importOriginal<object>(), captureVisit: mocks.capture,
}));
import { POST } from "./route";
const csrf = "a".repeat(43);
const body = { v: 1, eventId: "c13af925-efac-4564-bf03-b348ca61abf0", module: "action", csrfToken: csrf };
const request = (value: unknown = body) => new Request("https://app.test/api/analytics/visits", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, Origin: "https://app.test" }, body: JSON.stringify(value) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.coverage.mockReturnValue(new Date("2026-10-01T00:00:00Z"));
  mocks.visitor.mockResolvedValue({ channel: "web", csrfToken: csrf, userId: "employee" });
  mocks.mutation.mockReturnValue(undefined);
  mocks.capture.mockResolvedValue({ recorded: true });
});
describe("visit collection boundary", () => {
  it("does not collect while the operator has not enabled tracking", async () => {
    mocks.coverage.mockReturnValue(null);
    expect((await POST(request())).status).toBe(204);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.visitor).not.toHaveBeenCalled();
  });
  it("binds a report to the trusted visitor and current original CSRF", async () => {
    const response = await POST(request());
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ userId: "employee" }), body);
    expect(mocks.mutation).toHaveBeenCalledBefore(mocks.capture);
  });
  it("rejects an old tab after the cookie owner changed even if its header was refreshed", async () => {
    mocks.visitor.mockResolvedValue({ channel: "web", csrfToken: "b".repeat(43), userId: "other-employee" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it.each([
    { ...body, subjectId: "spoof" }, { ...body, occurredAt: "2026-01-01" },
    { ...body, module: "admin" }, { ...body, module: "action?token=private" },
    { ...body, v: 2 }, { ...body, eventId: "not-a-uuid" },
  ])("rejects forged identity, date, routes and invalid versions", async payload => {
    expect((await POST(request(payload))).status).toBe(400);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("bounds streaming request size before parsing", async () => {
    const incoming = request({ ...body, padding: "a".repeat(2000) });
    expect((await POST(incoming)).status).toBe(400);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it.each([401, 403])("does not store after an auth rejection (%s)", async status => {
    mocks.visitor.mockRejectedValue({ status });
    expect((await POST(request())).status).toBe(status);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

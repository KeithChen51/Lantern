import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ authorize: vi.fn(), mutation: vi.fn(), rankings: vi.fn() }));
vi.mock("@/modules/auth/access", async original => ({
  ...await original<typeof import("@/modules/auth/access")>(),
  requireAnalyticsSummary: deps.authorize, assertWebMutation: deps.mutation,
  authErrorResponse: (error: { status?: number }) => Response.json({ error: "access refused" }, { status: error.status ?? 503, headers: { "Cache-Control": "private, no-store" } }),
}));
vi.mock("@/modules/analytics/employee-rankings", async original => ({
  ...await original<typeof import("@/modules/analytics/employee-rankings")>(), getAuditedEmployeeRankings: deps.rankings,
}));
import { AccessError } from "@/modules/auth/access";
import { GET, POST } from "./route";
const principal = { userId: "user", account: "0007", credentialId: "credential" };
const request = (input: unknown = { start: "2026-10-01", end: "2026-10-31" }) =>
  new Request("https://app.example/api/admin/analytics/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
beforeEach(() => {
  vi.resetAllMocks();
  deps.authorize.mockResolvedValue(principal);
  deps.rankings.mockResolvedValue({ visits: { rows: [] }, ai: { rows: [] } });
});
describe("employee ranking endpoint", () => {
  it("does not expose names on GET or prefetch", async () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(deps.rankings).not.toHaveBeenCalled();
  });
  it.each([401, 403, 503] as const)("rejects callers without current platform access before parsing or querying (%s)", async status => {
    deps.authorize.mockRejectedValue(new AccessError("没有访问与使用统计权限", status));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(deps.mutation).not.toHaveBeenCalled();
    expect(deps.rankings).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin or missing CSRF before querying", async () => {
    deps.mutation.mockImplementation(() => { throw new AccessError("来源错误", 403); });
    expect((await POST(request())).status).toBe(403);
    expect(deps.rankings).not.toHaveBeenCalled();
  });
  it.each([
    { start: "2026-02-30", end: "2026-10-31" },
    { start: "2026-10-31", end: "2026-10-01" },
    { start: "2026-10-01" },
    { start: "2026-10-01", end: "2026-10-31", purpose: " " },
    { start: "2026-10-01", end: "2026-10-31", purpose: "核对使用情况", account: "other" },
    { start: "2026-10-01", end: "2026-10-31", approvalRef: "APPROVAL-OTHER" },
  ])("rejects invalid dates, reasons or extra identity selectors %j", async input => {
    expect((await POST(request(input))).status).toBe(400);
    expect(deps.rankings).not.toHaveBeenCalled();
  });
  it("loads rankings for a platform administrator without a separate grant or purpose", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(deps.mutation).toHaveBeenCalledWith(expect.any(Request), principal);
    expect(deps.rankings).toHaveBeenCalledWith(expect.objectContaining({
      principal, period: expect.objectContaining({ startDate: "2026-10-01", endDate: "2026-10-31" }),
    }));
    expect(deps.rankings.mock.calls[0][0]).not.toHaveProperty("purpose");
    expect(deps.rankings.mock.calls[0][0]).not.toHaveProperty("approvalRef");
  });
  it("accepts a valid legacy purpose without allowing it to change the server audit action", async () => {
    expect((await POST(request({ start: "2026-10-01", end: "2026-10-31", purpose: "核对本月推广使用情况" }))).status).toBe(200);
    expect(deps.rankings.mock.calls[0][0]).not.toHaveProperty("purpose");
  });
  it("revalidates the same session and returns no-store results", async () => {
    deps.rankings.mockImplementation(async input => { await input.recheck(); return { visits: { rows: [] }, ai: { rows: [] } }; });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(deps.authorize).toHaveBeenCalledTimes(2);
  });
  it("refuses disclosure after session replacement", async () => {
    deps.authorize.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, credentialId: "replaced" });
    deps.rankings.mockImplementation(async input => { await input.recheck(); return { employee: "private fixture" }; });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("private fixture");
  });
  it("refuses disclosure after the platform role is revoked", async () => {
    deps.authorize.mockResolvedValueOnce(principal).mockRejectedValueOnce(new AccessError("权限已撤销", 403));
    deps.rankings.mockImplementation(async input => { await input.recheck(); return { employee: "private fixture" }; });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("private fixture");
  });
  it("returns a fixed safe failure if the audit or query fails", async () => {
    deps.rankings.mockRejectedValue(new Error("mysql://private-connection"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-connection");
  });
});

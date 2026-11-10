import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ authorize: vi.fn(), mutation: vi.fn(), audited: vi.fn(), enabled: vi.fn() }));
vi.mock("@/config/features", () => ({ isHermitRecordsEnabled: deps.enabled }));
vi.mock("@/modules/auth/access", async original => ({
  ...await original<typeof import("@/modules/auth/access")>(),
  requireAnalyticsSummary: deps.authorize, assertWebMutation: deps.mutation,
}));
vi.mock("@/modules/hermit/admin-records-access", async original => ({
  ...await original<typeof import("@/modules/hermit/admin-records-access")>(),
  getAuditedHermitRecord: deps.audited,
}));
vi.mock("@/modules/hermit/admin-records-data", () => ({ readHermitRecord: vi.fn() }));
import { AccessError } from "@/modules/auth/access";
import { AppError } from "@/shared/errors";
import { GET, POST } from "./route";
const principal = { userId: "admin", account: "007", credentialId: "credential" };
const request = (input: unknown = { id: "session" }, query = "") =>
  new Request("https://app.example/api/admin/hermit-records/content" + query, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
beforeEach(() => {
  vi.resetAllMocks();
  // Preserve the dormant handler's authorization and audit regression coverage.
  deps.enabled.mockReturnValue(true);
  deps.authorize.mockResolvedValue(principal);
  deps.audited.mockImplementation(async input => { await input.recheck(); return { messages: [{ id: "m", role: "user", text: "private content" }], nextCursor: null }; });
});
describe("Hermit record content endpoint", () => {
  it("closes GET and prefetch without reading records", async () => {
    deps.enabled.mockReturnValue(false);
    const response = GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: { message: "路引记录已关闭。" } });
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(deps.audited).not.toHaveBeenCalled();
  });

  it.each([{ id: "session" }, { id: "session", cursor: "page_2" }])("closes existing clients' content requests before reading the body: %j", async input => {
    deps.enabled.mockReturnValue(false);
    const req = request(input);
    const response = await POST(req);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: { message: "路引记录已关闭。" } });
    expect(req.bodyUsed).toBe(false);
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(deps.mutation).not.toHaveBeenCalled();
    expect(deps.audited).not.toHaveBeenCalled();
  });

  it("does not disclose content on GET or prefetch", async () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it.each([401, 403, 503] as const)("rejects an unavailable platform session (%s)", async status => {
    deps.authorize.mockRejectedValue(new AccessError("private upstream", status));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(deps.audited).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("private");
  });
  it("requires CSRF before reading any content", async () => {
    deps.mutation.mockImplementationOnce(() => { throw new AccessError("CSRF rejected", 403); });
    expect((await POST(request())).status).toBe(403);
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it("allows every current platform administrator to view without an account list or reason", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(deps.audited).toHaveBeenCalledWith({
      principal, id: "session", cursor: undefined, recheck: expect.any(Function),
    });
  });
  it("passes only the validated selectors to audited reads and rechecks current authority", async () => {
    const response = await POST(request({ id: "session", cursor: "next_123" }));
    expect(response.status).toBe(200);
    expect(deps.audited).toHaveBeenCalledWith({
      principal, id: "session", cursor: "next_123", recheck: expect.any(Function),
    });
    expect(deps.authorize).toHaveBeenCalledTimes(2);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
  it.each([
    {}, { id: "" }, { id: "session", purpose: "check reason" },
    { id: "session", account: "other" }, { id: "session", approvalRef: "spoofed" },
    { id: "session", cursor: "" },
  ])("rejects malformed inputs and authority overrides %j", async input => {
    expect((await POST(request(input))).status).toBe(400);
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it("refuses URL selectors and overlarge input before auditing", async () => {
    expect((await POST(request(undefined, "?id=another"))).status).toBe(400);
    expect((await POST(request({ id: "a".repeat(17_000) }))).status).toBe(400);
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it("rejects duplicate form fields", async () => {
    const duplicate = new Request("https://app.example/api/admin/hermit-records/content", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "id=first&id=second",
    });
    expect((await POST(duplicate)).status).toBe(400);
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it.each([
    '{"id":"first","id":"second"}',
    '{"id":"first","\\u0069d":"second"}',
    '{"id":"first","cursor":"first","cursor":"second"}',
  ])("rejects duplicated JSON selectors before auditing %s", async body => {
    const duplicate = new Request("https://app.example/api/admin/hermit-records/content", {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    });
    expect((await POST(duplicate)).status).toBe(400);
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it("preserves printable quoted identifiers without treating their contents as keys", async () => {
    const id = 'legacy "id": "comment"';
    expect((await POST(request({ id }))).status).toBe(200);
    expect(deps.audited).toHaveBeenCalledWith(expect.objectContaining({ id }));
  });
  it.each(["user", "credential", "role"])("rechecks %s before returning any content", async change => {
    if (change === "user") deps.authorize.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, userId: "other" });
    if (change === "credential") deps.authorize.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, credentialId: "other" });
    if (change === "role") deps.authorize.mockResolvedValueOnce(principal).mockRejectedValueOnce(new AccessError("revoked", 403));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("private content");
  });
  it("returns a safe missing state and conceals unexpected audit or database failures", async () => {
    deps.audited.mockRejectedValueOnce(new AppError("not_found", "missing private id", 404));
    expect((await POST(request())).status).toBe(404);
    deps.audited.mockRejectedValueOnce(new Error("mysql://password"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("mysql");
  });
});

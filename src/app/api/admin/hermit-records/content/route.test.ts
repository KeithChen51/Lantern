import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ authorize: vi.fn(), mutation: vi.fn(), grant: vi.fn(), audited: vi.fn() }));
vi.mock("@/modules/auth/access", async original => ({
  ...await original<typeof import("@/modules/auth/access")>(),
  requireAnalyticsSummary: deps.authorize, assertWebMutation: deps.mutation,
}));
vi.mock("@/modules/hermit/admin-records-access", async original => ({
  ...await original<typeof import("@/modules/hermit/admin-records-access")>(),
  getHermitContentGrant: deps.grant, getAuditedHermitRecord: deps.audited,
}));
vi.mock("@/modules/hermit/admin-records-data", () => ({ readHermitRecord: vi.fn() }));
import { AccessError } from "@/modules/auth/access";
import { AppError } from "@/shared/errors";
import { GET, POST } from "./route";
const principal = { userId: "admin", account: "007", credentialId: "credential" };
const request = (input: unknown = { id: "session", purpose: "排查用户反馈" }, query = "") =>
  new Request("https://app.example/api/admin/hermit-records/content" + query, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
beforeEach(() => {
  vi.resetAllMocks();
  deps.authorize.mockResolvedValue(principal);
  deps.grant.mockReturnValue("APPROVAL-134");
  deps.audited.mockImplementation(async input => { await input.recheck(); return { messages: [{ id: "m", role: "user", text: "private content" }], nextCursor: null }; });
});
describe("Hermit record content endpoint", () => {
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
  it("requires both CSRF and a separate approved content grant", async () => {
    deps.mutation.mockImplementationOnce(() => { throw new AccessError("CSRF rejected", 403); });
    expect((await POST(request())).status).toBe(403);
    expect(deps.audited).not.toHaveBeenCalled();
    deps.grant.mockReturnValue(null);
    expect((await POST(request())).status).toBe(403);
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it("audits with server-approved authority and only the validated content selectors", async () => {
    const response = await POST(request({ id: "session", purpose: "  排查用户反馈  ", cursor: "next_123" }));
    expect(response.status).toBe(200);
    expect(deps.audited).toHaveBeenCalledWith({
      principal, approvalRef: "APPROVAL-134", id: "session", purpose: "排查用户反馈", cursor: "next_123", recheck: expect.any(Function),
    });
    expect(deps.authorize).toHaveBeenCalledTimes(2);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
  it.each([
    {}, { id: "session" }, { id: "session", purpose: "a" }, { id: "session", purpose: "bad\nreason" },
    { id: "session", purpose: "check reason", account: "other" }, { id: "session", purpose: "check reason", approvalRef: "spoofed" },
    { id: "session", purpose: "check reason", cursor: "" },
  ])("rejects malformed inputs and authority overrides %j", async input => {
    expect((await POST(request(input))).status).toBe(400);
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it("refuses URL selectors and overlarge input before auditing", async () => {
    expect((await POST(request(undefined, "?id=another"))).status).toBe(400);
    expect((await POST(request({ id: "session", purpose: "a".repeat(17_000) }))).status).toBe(400);
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it("rejects duplicate form fields", async () => {
    const duplicate = new Request("https://app.example/api/admin/hermit-records/content", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "id=first&id=second&purpose=check+reason",
    });
    expect((await POST(duplicate)).status).toBe(400);
    expect(deps.audited).not.toHaveBeenCalled();
  });
  it.each(["user", "credential", "approval", "role"])("rechecks %s before returning any content", async change => {
    if (change === "user") deps.authorize.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, userId: "other" });
    if (change === "credential") deps.authorize.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, credentialId: "other" });
    if (change === "approval") deps.grant.mockReturnValueOnce("APPROVAL-134").mockReturnValueOnce(null);
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

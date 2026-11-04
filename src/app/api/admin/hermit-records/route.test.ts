import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ authorize: vi.fn(), auditedList: vi.fn(), enabled: vi.fn() }));
vi.mock("@/config/features", () => ({ isHermitRecordsEnabled: deps.enabled }));
vi.mock("@/modules/auth/access", async original => ({
  ...await original<typeof import("@/modules/auth/access")>(), requireAnalyticsSummary: deps.authorize,
}));
vi.mock("@/modules/hermit/admin-records-data", () => ({ listHermitRecords: vi.fn(), readHermitRecord: vi.fn() }));
vi.mock("@/modules/hermit/admin-records-access", async original => ({
  ...await original<typeof import("@/modules/hermit/admin-records-access")>(), getAuditedHermitRecords: deps.auditedList,
}));
import { AccessError } from "@/modules/auth/access";
import { AppError } from "@/shared/errors";
import { GET } from "./route";
const request = (query = "") => new Request("https://app.example/api/admin/hermit-records" + query);
const principal = { userId: "admin", credentialId: "credential" };
beforeEach(() => {
  vi.resetAllMocks();
  // Preserve the dormant handler's authorization and audit regression coverage.
  deps.enabled.mockReturnValue(true);
  deps.authorize.mockResolvedValue(principal);
  deps.auditedList.mockImplementation(async input => {
    await input.recheck();
    return { rows: [{ id: "session", actor: "employee", createdAt: "date", lastQuestionAt: "date", turns: 2,
      employeeNumber: "007", organization: "Service" }], nextCursor: null };
  });
});
describe("Hermit record listing", () => {
  it("closes listing and pagination before authorization or data access", async () => {
    deps.enabled.mockReturnValue(false);
    const response = await GET(request("?start=2026-11-01&end=2026-11-02&actor=employee&id=session&cursor=page_2"));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: { message: "路引记录已关闭。" } });
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(deps.auditedList).not.toHaveBeenCalled();
  });

  it("returns an audited identity-bearing page with all filters and a current-session recheck", async () => {
    const response = await GET(request("?start=2026-11-01&end=2026-11-02&actor=guest&id=session&cursor=abc_1"));
    expect(response.status).toBe(200);
    expect(deps.auditedList).toHaveBeenCalledWith({ principal,
      filters: { start: "2026-11-01", end: "2026-11-02", actor: "guest", id: "session", cursor: "abc_1" },
      recheck: expect.any(Function) });
    expect(deps.authorize).toHaveBeenCalledTimes(2);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    const text = await response.text();
    expect(text).toContain("007");
    expect(text).toContain("Service");
    expect(text).not.toMatch(/content|title|guestId/);
  });
  it.each([401, 403, 503] as const)("requires current platform authorization before reading filters (%s)", async status => {
    deps.authorize.mockRejectedValue(new AccessError("secret provider error", status));
    const response = await GET(request("?account=secret"));
    expect(response.status).toBe(status);
    expect(deps.auditedList).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("secret");
  });
  it.each([
    "?actor=admin", "?actor=employee&actor=guest", "?start=1", "?id=", "?cursor=",
    "?account=007", "?start=2026-11-01&start=2026-11-02", "?cursor=unsafe/identifier",
  ])("refuses invalid or duplicate selectors %s", async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(deps.auditedList).not.toHaveBeenCalled();
  });
  it("safely maps repository validation and hides database errors", async () => {
    deps.auditedList.mockRejectedValueOnce(new AppError("bad_request", "private invalid date detail", 400));
    const invalid = await GET(request("?start=2026-02-30"));
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).not.toContain("private");
    deps.auditedList.mockRejectedValueOnce(new Error("mysql://credentials"));
    const unavailable = await GET(request());
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("mysql");
  });
  it.each(["user", "credential", "role"])("refuses identity-bearing rows if %s changes during the read", async change => {
    if (change === "user") deps.authorize.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, userId: "other" });
    if (change === "credential") deps.authorize.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, credentialId: "other" });
    if (change === "role") deps.authorize.mockResolvedValueOnce(principal).mockRejectedValueOnce(new AccessError("revoked", 403));
    const response = await GET(request("?cursor=page_2"));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toMatch(/007|Service/);
  });
  it("does not disclose rows when their audit fails", async () => {
    deps.auditedList.mockRejectedValue(new Error("audit unavailable"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/007|Service|audit unavailable/);
  });
});

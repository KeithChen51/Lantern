import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ authorize: vi.fn(), list: vi.fn() }));
vi.mock("@/modules/auth/access", async original => ({
  ...await original<typeof import("@/modules/auth/access")>(), requireAnalyticsSummary: deps.authorize,
}));
vi.mock("@/modules/hermit/admin-records-data", () => ({ listHermitRecords: deps.list, readHermitRecord: vi.fn() }));
import { AccessError } from "@/modules/auth/access";
import { AppError } from "@/shared/errors";
import { GET } from "./route";
const request = (query = "") => new Request("https://app.example/api/admin/hermit-records" + query);
beforeEach(() => {
  vi.resetAllMocks();
  deps.authorize.mockResolvedValue({ userId: "admin" });
  deps.list.mockResolvedValue({ rows: [{ id: "session", actor: "employee", createdAt: "date", lastQuestionAt: "date", turns: 2 }], nextCursor: null });
});
describe("Hermit record listing", () => {
  it("returns metadata only with all filter values passed to the repository", async () => {
    const response = await GET(request("?start=2026-11-01&end=2026-11-02&actor=guest&id=session&cursor=abc_1"));
    expect(response.status).toBe(200);
    expect(deps.list).toHaveBeenCalledWith({ start: "2026-11-01", end: "2026-11-02", actor: "guest", id: "session", cursor: "abc_1" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(await response.text()).not.toMatch(/content|title|account|guestId/);
  });
  it.each([401, 403, 503] as const)("requires current platform authorization before reading filters (%s)", async status => {
    deps.authorize.mockRejectedValue(new AccessError("secret provider error", status));
    const response = await GET(request("?account=secret"));
    expect(response.status).toBe(status);
    expect(deps.list).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("secret");
  });
  it.each([
    "?actor=admin", "?actor=employee&actor=guest", "?start=1", "?id=", "?cursor=",
    "?account=007", "?start=2026-11-01&start=2026-11-02", "?cursor=unsafe/identifier",
  ])("refuses invalid or duplicate selectors %s", async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(deps.list).not.toHaveBeenCalled();
  });
  it("safely maps repository validation and hides database errors", async () => {
    deps.list.mockRejectedValueOnce(new AppError("bad_request", "private invalid date detail", 400));
    const invalid = await GET(request("?start=2026-02-30"));
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).not.toContain("private");
    deps.list.mockRejectedValueOnce(new Error("mysql://credentials"));
    const unavailable = await GET(request());
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("mysql");
  });
});

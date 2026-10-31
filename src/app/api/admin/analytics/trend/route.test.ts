import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorize, errorResponse, trend } = vi.hoisted(() => ({ authorize: vi.fn(), errorResponse: vi.fn(), trend: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireAnalyticsSummary: authorize, authErrorResponse: errorResponse }));
vi.mock("@/modules/analytics/visit-trend", async original => ({ ...await original<typeof import("@/modules/analytics/visit-trend")>(), getVisitTrend: trend }));
import { GET } from "./route";

const request = (query = "") => new Request(`https://example.test/api/admin/analytics/trend${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  authorize.mockResolvedValue({ capabilities: ["analytics:summary"] });
  trend.mockResolvedValue({ range: "7", startDate: "2026-10-25", endDate: "2026-10-31", days: [] });
  errorResponse.mockImplementation(error => Response.json({ error: "forbidden" }, { status: error.status }));
});
function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("visit trend endpoint", () => {
  it.each([401, 403, 503])("authenticates before validating parameters or querying (%s)", async status => {
    authorize.mockRejectedValue({ status });
    const incoming = request("?range=forever&employee=someone");
    const response = await GET(incoming);
    expect(response.status).toBe(status);
    expect(authorize).toHaveBeenCalledExactlyOnceWith(incoming);
    expect(trend).not.toHaveBeenCalled();
    expectPrivate(response);
  });

  it.each([["", "7"], ["?range=7", "7"], ["?range=30", "30"], ["?range=all", "all"]])("returns the aggregate trend for %s", async (query, range) => {
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    expect(trend).toHaveBeenCalledExactlyOnceWith(range);
    expectPrivate(response);
    expect(await response.json()).toMatchObject({ days: [] });
  });

  it.each(["?range=365", "?range=", "?range=7&range=30", "?employee=other", "?range=all&start=2026-10-01"])("rejects invalid or personal detail filters %s", async query => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(trend).not.toHaveBeenCalled();
    expectPrivate(response);
  });

  it("does not leak database errors", async () => {
    trend.mockRejectedValue(new Error("private mysql://secret"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(await response.text()).not.toContain("secret");
  });
});

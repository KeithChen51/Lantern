import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorize, errorResponse, summary } = vi.hoisted(() => ({ authorize: vi.fn(), errorResponse: vi.fn(), summary: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireAnalyticsSummary: authorize, authErrorResponse: errorResponse }));
vi.mock("@/modules/analytics/summary", () => ({ getAnalyticsSummary: summary }));
import { GET } from "./route";

const request = (query = "") => new Request(`https://example.test/api/admin/analytics${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  authorize.mockResolvedValue({ capabilities: ["analytics:summary"] });
  summary.mockResolvedValue({ period: { days: 7 }, sections: [] });
  errorResponse.mockImplementation(error => Response.json({ error: "forbidden" }, { status: error.status, headers: { "Cache-Control": "private, no-store" } }));
});

describe("analytics summary endpoint", () => {
  it.each([401, 403, 503])("authenticates before loading or validating a request (%s)", async status => {
    authorize.mockRejectedValue({ status });
    const incoming = request("?days=365&employee=someone");
    const response = await GET(incoming);
    expect(response.status).toBe(status);
    expect(authorize).toHaveBeenCalledExactlyOnceWith(incoming);
    expect(summary).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each([["", 7], ["?days=7", 7], ["?days=30", 30]])("returns only supported bounded summaries for %s", async (query, days) => {
    const response = await GET(request(query as string));
    expect(response.status).toBe(200);
    expect(summary).toHaveBeenCalledExactlyOnceWith(days);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it.each(["?days=365", "?days=", "?days=7&days=30", "?employee=other", "?days=7&search=secret"]) ("rejects unsupported ranges and personal detail filters %s", async query => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(summary).not.toHaveBeenCalled();
  });

  it("returns a safe service failure without database details", async () => {
    summary.mockRejectedValue(new Error("private data fixture"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("private data fixture");
  });
});

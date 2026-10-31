import { afterEach, describe, expect, it, vi } from "vitest";
import { createVisitReporter, visitEventId, visitNavigationKey } from "./VisitReporter";
import { visitModuleForPath } from "@/modules/analytics/visit-modules";

afterEach(() => vi.useRealTimers());

describe("visible business navigation reports", () => {
  it("does not count consumed Hermit entry parameters or unrelated query changes as new pages", () => {
    expect(visitNavigationKey("/hermit", new URLSearchParams("case=example"))).toBe(visitNavigationKey("/hermit", new URLSearchParams()));
    expect(visitNavigationKey("/action", new URLSearchParams("utm_source=origin"))).toBe("/action");
    expect(visitNavigationKey("/search", new URLSearchParams("q=one"))).not.toBe(visitNavigationKey("/search", new URLSearchParams("q=two")));
    expect(visitNavigationKey("/search", new URLSearchParams("q=one&source=link"))).toBe(visitNavigationKey("/search", new URLSearchParams("q=one")));
  });
  it("deduplicates repeated effects and visibility toggles while counting later navigation and history restoration", () => {
    const deliver = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    let sequence = 0;
    const reporter = createVisitReporter("owner", "session-bound-csrf", 1000, { deliver, now: () => 100, uuid: () => `id-${++sequence}` });
    reporter.enter("/action?", "action");
    expect(deliver).not.toHaveBeenCalled();
    reporter.show();
    reporter.enter("/action?", "action");
    reporter.show();
    expect(deliver).toHaveBeenCalledTimes(1);
    reporter.enter("/hermit?", "hermit");
    reporter.show();
    reporter.enter("/action?", "action");
    reporter.show();
    reporter.restore();
    reporter.show();
    reporter.show();
    expect(deliver).toHaveBeenCalledTimes(4);
    expect(deliver.mock.calls.map(call => JSON.parse(call[1].body).eventId)).toEqual(["id-1", "id-2", "id-3", "id-4"]);
  });

  it("retains only the latest hidden navigation and sends no route, query, body text or identity", () => {
    const deliver = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const reporter = createVisitReporter("employee-id", "bound-csrf", 1000, { deliver, now: () => 100, uuid: () => "uuid" });
    reporter.enter("/search?q=PRIVATE", "search");
    reporter.enter("/action/private-case", "action");
    reporter.show();
    const [url, request] = deliver.mock.calls[0];
    expect(url).toBe("/api/analytics/visits");
    expect(JSON.parse(request.body)).toEqual({ v: 1, eventId: "uuid", module: "action", csrfToken: "bound-csrf" });
    expect(request.headers["X-CSRF-Token"]).toBe("bound-csrf");
    expect(request.body).not.toMatch(/PRIVATE|private-case|employee-id/);
  });

  it("retries transient failures with the same session binding and event ID", async () => {
    vi.useFakeTimers();
    const deliver = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const reporter = createVisitReporter("old-owner", "old-csrf", Date.now() + 10_000, { deliver, uuid: () => "stable-id" });
    reporter.enter("/", "heart");
    reporter.show();
    await vi.runAllTimersAsync();
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver.mock.calls[0][1].body).toBe(deliver.mock.calls[1][1].body);
    expect(deliver.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("old-csrf");
  });

  it.each([401, 403, 429])("does not retry rejected credentials or limits (%s)", async status => {
    vi.useFakeTimers();
    const deliver = vi.fn().mockResolvedValue(new Response(null, { status }));
    const reporter = createVisitReporter("owner", "csrf", Date.now() + 10000, { deliver, uuid: () => "id" });
    reporter.enter("/", "heart"); reporter.show();
    await vi.runAllTimersAsync();
    expect(deliver).toHaveBeenCalledTimes(1);
  });
  it("drops scheduled delivery when the owner leaves or the session changes", async () => {
    vi.useFakeTimers();
    const deliver = vi.fn().mockRejectedValue(new Error("offline"));
    const reporter = createVisitReporter("old-owner", "old-csrf", Date.now() + 10000, { deliver, uuid: () => "id" });
    reporter.enter("/", "heart"); reporter.show();
    await Promise.resolve();
    reporter.stop();
    await vi.runAllTimersAsync();
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("skips expired sessions, unsupported pages, and unavailable secure randomness", () => {
    const deliver = vi.fn();
    const expired = createVisitReporter("owner", "csrf", 100, { deliver, now: () => 100 });
    expired.enter("/", "heart"); expired.show();
    const noRandom = createVisitReporter("owner", "csrf", 1000, { deliver, now: () => 100, uuid: () => null });
    noRandom.enter("/", "heart"); noRandom.show();
    const excluded = createVisitReporter("owner", "csrf", 1000, { deliver, now: () => 100, uuid: () => "id" });
    excluded.enter("/admin/analytics", null); excluded.show();
    expect(deliver).not.toHaveBeenCalled();
    expect(visitModuleForPath("/admin/analytics")).toBeNull();
    expect(visitModuleForPath("/auth/confirm")).toBeNull();
    expect(visitModuleForPath("/api/chat")).toBeNull();
    expect(visitModuleForPath("/action/case")).toBe("action");
  });

  it("generates a v4 ID in HTTP contexts that only expose getRandomValues", () => {
    const source = { getRandomValues: (bytes: Uint8Array) => bytes.fill(255) } as unknown as Crypto;
    expect(visitEventId(source)).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(visitEventId({ getRandomValues: () => { throw new Error("blocked"); } } as unknown as Crypto)).toBeNull();
  });
});

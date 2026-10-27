import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSession } from "@/components/auth/auth-fetch";
import { createWatermarkLifecycle, type WatermarkStatus } from "./lifecycle";
import { createSdkCoordinator, type WatermarkResult, type WatermarkSdk } from "./sdk";

const SDK_URL = "https://official.invalid/watermark.js";
const START = 1_800_000_000_000;
function session(id = "a"): WebSession {
  return { kind: "employee", user: { id, account: `account-${id}`, displayName: "Employee" }, capabilities: [], csrfToken: "test", expiresAt: START + 8 * 3_600_000 };
}
function response(id = "a", expiresAt = session().expiresAt) {
  return Response.json({ owner: { userId: id, account: `account-${id}` }, data: { wmInfo: `opaque-${id}`, wmOpacity: 0.1 }, expiresAt });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const active: ReturnType<typeof createWatermarkLifecycle>[] = [];
function fixture(owner: WebSession | null = session(), sdkUrl: string | null = SDK_URL, coordinator = createSdkCoordinator()) {
  const request = vi.fn<typeof fetch>().mockImplementation(async () => response(owner?.user.id));
  const sdk: WatermarkSdk = { init: vi.fn().mockReturnValue({ ok: true, status: "loaded" }), destroyWm: vi.fn() };
  const loadSdk = vi.fn().mockResolvedValue(sdk);
  const statuses: WatermarkStatus[] = [];
  const controller = createWatermarkLifecycle(owner, sdkUrl, { request, loadSdk, coordinator, onStatus: value => statuses.push(value) });
  active.push(controller);
  return { controller, request, sdk, loadSdk, statuses, coordinator };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(START); });
afterEach(() => { for (const controller of active.splice(0)) controller.dispose(); vi.useRealTimers(); });

describe("employee watermark lifecycle", () => {
  it.each([null, { ...session(), kind: "guest" as const }, { ...session(), user: { ...session().user, account: " " } }])("does no work for an ineligible session", async owner => {
    const f = fixture(owner); f.controller.start(); await flush();
    expect(f.request).not.toHaveBeenCalled(); expect(f.loadSdk).not.toHaveBeenCalled();
  });
  it("does no work when disabled or already expired", async () => {
    const disabled = fixture(session(), null), expired = fixture({ ...session(), expiresAt: START });
    disabled.controller.start(); expired.controller.start(); await flush();
    expect(disabled.request).not.toHaveBeenCalled(); expect(expired.request).not.toHaveBeenCalled();
    expect(expired.statuses.at(-1)).toBe("expired");
  });
  it.each(["loaded", "skipped_client_watermark"])("accepts %s and refreshes at thirty minutes", async status => {
    const f = fixture(); vi.mocked(f.sdk.init).mockResolvedValue({ ok: true, status });
    f.controller.start(); await flush();
    expect(f.sdk.init).toHaveBeenCalledWith({ data: { wmInfo: "opaque-a", wmOpacity: 0.1 }, conflictDetectionSwitch: true });
    expect(f.statuses.at(-1)).toBe(status);
    await vi.advanceTimersByTimeAsync(30 * 60_000 - 1); expect(f.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.request.mock.calls[0]).toEqual(["/api/watermark/web/communicate", expect.objectContaining({ method: "POST", body: "{}", signal: expect.any(AbortSignal) })]);
  });
  it("retries failures with bounded backoff and never overlaps pending requests", async () => {
    const f = fixture(); f.request.mockRejectedValue(new Error("private upstream message"));
    f.controller.start(); await flush();
    for (const [index, delay] of [5_000, 10_000, 20_000, 40_000, 60_000, 60_000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1); expect(f.request).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1); expect(f.request).toHaveBeenCalledTimes(index + 2);
    }
    const pending = deferred<Response>(); f.request.mockReturnValue(pending.promise);
    await vi.advanceTimersByTimeAsync(60_000); const count = f.request.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100_000); expect(f.request).toHaveBeenCalledTimes(count);
    expect(f.statuses).not.toContain("private upstream message");
    pending.resolve(response()); await flush();
  });
  it("aborts a timed out request and retries after it rejects", async () => {
    const f = fixture();
    f.request.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    f.controller.start(); await vi.advanceTimersByTimeAsync(15_000);
    expect(f.statuses.at(-1)).toBe("retrying");
    await vi.advanceTimersByTimeAsync(5_000); expect(f.request).toHaveBeenCalledTimes(2);
  });
  it("keeps the request timeout active while response body parsing is pending", async () => {
    const f = fixture();
    f.request.mockImplementationOnce(async (_url, init) => {
      const result = response();
      vi.spyOn(result, "json").mockImplementation(() => new Promise((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new Error("body aborted")), { once: true });
      }));
      return result;
    });
    f.controller.start(); await flush(); await vi.advanceTimersByTimeAsync(15_000);
    expect(f.request.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(f.loadSdk).not.toHaveBeenCalled(); expect(f.statuses.at(-1)).toBe("retrying");
    await vi.advanceTimersByTimeAsync(5_000); expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.statuses.at(-1)).toBe("loaded");
  });
  it("removes a live watermark at the server expiry and makes no further calls", async () => {
    const f = fixture(); f.request.mockResolvedValue(response("a", START + 1_000));
    f.controller.start(); await flush(); vi.mocked(f.sdk.destroyWm).mockClear();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.sdk.destroyWm).toHaveBeenCalledOnce(); expect(f.statuses.at(-1)).toBe("expired");
    await vi.advanceTimersByTimeAsync(3_600_000); expect(f.request).toHaveBeenCalledOnce();
  });
  it.each([401, 403, 404])("stops on HTTP %s", async code => {
    const f = fixture(); f.request.mockResolvedValue(new Response(null, { status: code }));
    f.controller.start(); await flush(); await vi.advanceTimersByTimeAsync(600_000);
    expect(f.request).toHaveBeenCalledOnce(); expect(f.loadSdk).not.toHaveBeenCalled();
    expect(f.statuses.at(-1)).toBe(code === 404 ? "disabled" : "unauthorized");
  });
  it("handles authFetch's thrown authorization error without retry", async () => {
    const f = fixture(); f.request.mockRejectedValue({ status: 403 });
    f.controller.start(); await flush(); await vi.advanceTimersByTimeAsync(60_000);
    expect(f.request).toHaveBeenCalledOnce(); expect(f.statuses.at(-1)).toBe("unauthorized");
  });
  it("rejects another owner before loading the SDK", async () => {
    const f = fixture(); f.request.mockResolvedValue(response("b"));
    f.controller.start(); await flush(); expect(f.loadSdk).not.toHaveBeenCalled();
    expect(f.statuses.at(-1)).toBe("unauthorized");
  });
  it("retries a failed SDK init and never forwards visible watermark content", async () => {
    const f = fixture();
    f.request.mockImplementation(async () => Response.json({
      owner: { userId: "a", account: "account-a" }, expiresAt: session().expiresAt,
      data: { wmInfo: "opaque-a", wmOpacity: 0.1, mContentList: ["must not be rendered"] },
    }));
    vi.mocked(f.sdk.init).mockReturnValueOnce({ ok: false, status: "failed", message: "private supplier detail" });
    f.controller.start(); await flush(); expect(f.statuses.at(-1)).toBe("retrying");
    expect(f.sdk.init).toHaveBeenCalledWith({ data: { wmInfo: "opaque-a", wmOpacity: 0.1 }, conflictDetectionSwitch: true });
    await vi.advanceTimersByTimeAsync(5_000); expect(f.statuses.at(-1)).toBe("loaded");
  });
  it("never initializes when the identity expired during SDK loading", async () => {
    const f = fixture(); const loading = deferred<WatermarkSdk>();
    f.request.mockResolvedValueOnce(response("a", START + 1_000)); f.loadSdk.mockReturnValueOnce(loading.promise);
    f.controller.start(); await flush(); await vi.advanceTimersByTimeAsync(1_000);
    expect(f.loadSdk.mock.calls[0][1].aborted).toBe(true);
    loading.resolve(f.sdk); await flush(); expect(f.sdk.init).not.toHaveBeenCalled();
    expect(f.statuses.at(-1)).toBe("expired");
  });
  it("ignores an aborted old response after identity replacement, including cleanup", async () => {
    const old = fixture(), next = fixture(session("b"), SDK_URL, old.coordinator);
    const pending = deferred<Response>(); old.request.mockReturnValue(pending.promise);
    old.controller.start(); old.controller.dispose(); next.controller.start(); await flush();
    expect(old.request.mock.calls[0][1]!.signal!.aborted).toBe(true);
    pending.resolve(response()); await flush();
    expect(old.loadSdk).not.toHaveBeenCalled(); expect(next.sdk.init).toHaveBeenCalledOnce();
    vi.mocked(next.sdk.destroyWm).mockClear(); old.controller.dispose();
    expect(next.sdk.destroyWm).not.toHaveBeenCalled();
  });
  it("serializes late init cleanup before the next user's init", async () => {
    const old = fixture(), next = fixture(session("b"), SDK_URL, old.coordinator);
    const pending = deferred<WatermarkResult>(); vi.mocked(old.sdk.init).mockReturnValue(pending.promise);
    old.controller.start(); await flush(); old.controller.dispose(); next.controller.start(); await flush();
    expect(next.sdk.init).not.toHaveBeenCalled();
    const events: string[] = [];
    vi.mocked(old.sdk.destroyWm).mockImplementation(() => { events.push("clear-old"); });
    vi.mocked(next.sdk.init).mockImplementation(() => { events.push("init-new"); return { ok: true, status: "loaded" }; });
    pending.resolve({ ok: true, status: "loaded" }); await flush();
    expect(events).toEqual(["clear-old", "init-new"]);
    old.controller.dispose(); expect(next.statuses.at(-1)).toBe("loaded");
  });
  it("invalidates an init that exceeds its watchdog without allowing unsafe concurrent init", async () => {
    const f = fixture(); const pending = deferred<WatermarkResult>(); vi.mocked(f.sdk.init).mockReturnValueOnce(pending.promise);
    f.controller.start(); await flush(); await vi.advanceTimersByTimeAsync(15_000);
    expect(f.statuses.at(-1)).toBe("retrying"); expect(f.sdk.init).toHaveBeenCalledOnce();
    pending.resolve({ ok: true, status: "loaded" }); await flush();
    expect(f.request).toHaveBeenCalledTimes(2); expect(f.statuses.at(-1)).toBe("loaded");
  });
  it("destroys on suspension and revalidates on resume without reusing data", async () => {
    const f = fixture(); f.controller.start(); await flush(); vi.mocked(f.sdk.destroyWm).mockClear();
    f.controller.suspend(); expect(f.sdk.destroyWm).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3_600_000); expect(f.request).toHaveBeenCalledOnce();
    f.controller.resume(); await flush(); expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.sdk.init).toHaveBeenCalledTimes(2);
  });
  it("does not resume after a sleeping session expired", async () => {
    const f = fixture({ ...session(), expiresAt: START + 1_000 });
    f.controller.start(); await flush(); f.controller.suspend(); await vi.advanceTimersByTimeAsync(2_000);
    f.controller.resume(); await flush(); expect(f.request).toHaveBeenCalledOnce(); expect(f.statuses.at(-1)).toBe("expired");
  });
  it("does not initialize data obtained before suspension", async () => {
    const f = fixture(); const pending = deferred<Response>(); f.request.mockReturnValueOnce(pending.promise);
    f.controller.start(); f.controller.suspend(); f.controller.resume();
    pending.resolve(response()); await flush();
    expect(f.request).toHaveBeenCalledTimes(2); expect(f.sdk.init).toHaveBeenCalledOnce();
  });
  it("allows mount-cleanup-remount to reuse a pending SDK load safely", async () => {
    const first = fixture(), second = fixture(session(), SDK_URL, first.coordinator);
    const loading = deferred<WatermarkSdk>(); first.loadSdk.mockReturnValue(loading.promise); second.loadSdk.mockReturnValue(loading.promise);
    first.controller.start(); await flush(); first.controller.dispose(); second.controller.start(); await flush();
    loading.resolve(second.sdk); await flush();
    expect(first.sdk.init).not.toHaveBeenCalled(); expect(second.sdk.init).toHaveBeenCalledOnce();
  });
});

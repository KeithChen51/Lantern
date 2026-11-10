import type { WebSession } from "@/components/auth/auth-fetch";
import type { WatermarkData, WatermarkSdk, createSdkCoordinator } from "./sdk";

export type WatermarkStatus = "disabled" | "loading" | "loaded" | "skipped_client_watermark" | "retrying" | "expired" | "suspended" | "unauthorized";
type Dependencies = {
  request: typeof fetch;
  loadSdk: (url: string, signal?: AbortSignal) => Promise<WatermarkSdk>;
  coordinator: ReturnType<typeof createSdkCoordinator>;
  onStatus?: (status: WatermarkStatus) => void;
  now?: () => number;
};
const REFRESH_MS = 30 * 60_000;
const MAX_TIMER_MS = 2_147_483_647;

export function createWatermarkLifecycle(session: WebSession | null, sdkUrl: string | null | undefined, deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const token = Symbol("watermark-effect");
  let disposed = false;
  let suspended = false;
  let generation = 0;
  let running = false;
  let queued = false;
  let terminal = false;
  let backoff = 5_000;
  let expiresAt = session?.expiresAt ?? 0;
  let pending: AbortController | undefined;
  let workTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let initTimer: ReturnType<typeof setTimeout> | undefined;
  const eligible = !!sdkUrl && !!session && session.kind !== "guest" && !!session.user.id && !!session.user.account.trim() && Number.isFinite(expiresAt);
  const status = (value: WatermarkStatus) => { if (!disposed) deps.onStatus?.(value); };
  const clearTimers = () => { clearTimeout(workTimer); clearTimeout(expiryTimer); clearTimeout(initTimer); };
  const invalidate = () => {
    generation++;
    queued = false;
    pending?.abort();
    clearTimers();
    deps.coordinator.clear(token);
  };
  const current = (version: number) => !disposed && !suspended && !terminal && generation === version && now() < expiresAt;
  const expire = () => { terminal = true; invalidate(); status("expired"); };
  const armExpiry = () => {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => {
      if (now() >= expiresAt) expire();
      else armExpiry();
    }, Math.min(MAX_TIMER_MS, Math.max(0, expiresAt - now())));
  };
  const schedule = (delay: number) => { clearTimeout(workTimer); workTimer = setTimeout(() => { void run(); }, delay); };

  async function run() {
    if (!eligible || disposed || suspended || terminal) return;
    if (now() >= expiresAt) { expire(); return; }
    if (running) { queued = true; return; }
    running = true;
    const version = generation;
    const abort = new AbortController();
    const requestTimer = setTimeout(() => abort.abort(), 15_000);
    pending = abort;
    status("loading");
    armExpiry();
    try {
      const response = await deps.request("/api/watermark/web/communicate", {
        method: "POST", body: "{}", headers: { "content-type": "application/json" }, signal: abort.signal,
      });
      if (!current(version)) return;
      if (abort.signal.aborted) throw new Error("watermark_request_timeout");
      if ([401, 403, 404].includes(response.status)) {
        terminal = true;
        invalidate();
        status(response.status === 404 ? "disabled" : "unauthorized");
        return;
      }
      if (!response.ok) throw new Error("watermark_request_failed");
      const payload = await response.json() as { data: WatermarkData; owner: { userId: string; account: string }; expiresAt: number };
      clearTimeout(requestTimer);
      if (!current(version)) return;
      if (abort.signal.aborted) throw new Error("watermark_request_timeout");
      if (payload.owner?.userId !== session!.user.id || payload.owner?.account !== session!.user.account) {
        terminal = true;
        invalidate();
        status("unauthorized");
        return;
      }
      if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= now()) { expire(); return; }
      expiresAt = Math.min(session!.expiresAt, payload.expiresAt);
      armExpiry();
      if (typeof payload.data?.wmInfo !== "string" || !payload.data.wmInfo || !Number.isFinite(payload.data.wmOpacity)) throw new Error("watermark_data_invalid");
      const sdk = await deps.loadSdk(sdkUrl!, abort.signal);
      if (!current(version)) return;
      // init is not cancellable. Invalidate late output, but retain the global
      // serialization lock until it actually settles before attempting again.
      initTimer = setTimeout(() => {
        if (!current(version)) return;
        generation++;
        deps.coordinator.clear(token);
        status("retrying");
        queued = true;
      }, 15_000);
      const { wmInfo, wmOpacity, lbOpacity, dispersion, macroRows, macroCols } = payload.data;
      const data: WatermarkData = {
        wmInfo, wmOpacity,
        ...(lbOpacity === undefined ? {} : { lbOpacity }),
        ...(dispersion === undefined ? {} : { dispersion }),
        ...(macroRows === undefined ? {} : { macroRows }),
        ...(macroCols === undefined ? {} : { macroCols }),
      };
      const result = await deps.coordinator.initialize(token, sdk, data, () => current(version));
      clearTimeout(initTimer);
      if (!current(version) || !result) return;
      backoff = 5_000;
      status(result as "loaded" | "skipped_client_watermark");
      schedule(REFRESH_MS);
    } catch (error) {
      if (!current(version)) return;
      deps.coordinator.clear(token);
      const httpStatus = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
      if (httpStatus === 401 || httpStatus === 403) {
        terminal = true;
        invalidate();
        status("unauthorized");
      } else {
        status("retrying");
        schedule(backoff);
        backoff = Math.min(60_000, backoff * 2);
      }
    } finally {
      clearTimeout(requestTimer);
      clearTimeout(initTimer);
      running = false;
      if (pending === abort) pending = undefined;
      if (queued) { queued = false; void run(); }
    }
  }

  return {
    start() {
      if (!eligible) { status("disabled"); return; }
      void run();
    },
    suspend() {
      if (disposed || !eligible) return;
      suspended = true;
      invalidate();
      status("suspended");
    },
    resume() {
      if (disposed || !eligible || terminal) return;
      // Also discard data when visibility/pageshow arrives without prior pagehide.
      invalidate();
      suspended = false;
      void run();
    },
    dispose() { disposed = true; invalidate(); },
  };
}

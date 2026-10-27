export type WatermarkData = {
  wmInfo: string;
  wmOpacity: number;
  lbOpacity?: number;
  dispersion?: number;
  macroRows?: number;
  macroCols?: number;
};

export type WatermarkResult = { ok: boolean; status: string; message?: string };
export type WatermarkSdk = {
  init(options: { data: WatermarkData; conflictDetectionSwitch: true }): WatermarkResult | Promise<WatermarkResult>;
  destroyWm(): void;
  isExist?(): boolean;
};

declare global {
  interface Window { watermark?: WatermarkSdk }
}

/** Shared across StrictMode effects. A failed/expired script never poisons retries. */
export function createSdkLoader(browser: Window, document: Document, timeoutMs = 15_000) {
  type Load = { promise: Promise<WatermarkSdk>; cancel: () => void; subscribers: number; settled: boolean };
  const loads = new Map<string, Load>();
  return (url: string, signal?: AbortSignal): Promise<WatermarkSdk> => {
    if (signal?.aborted) return Promise.reject(new Error("watermark_sdk_aborted"));
    let entry = loads.get(url);
    if (!entry) {
      let cancel = () => {};
      const promise = new Promise<WatermarkSdk>((resolve, reject) => {
        const script = document.createElement("script");
        let finished = false;
        const finish = (error?: Error) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          script.onload = null;
          script.onerror = null;
          if (error) {
            script.remove();
            reject(error);
          } else {
            resolve(browser.watermark!);
          }
        };
        cancel = () => finish(new Error("watermark_sdk_aborted"));
        const timeout = setTimeout(() => finish(new Error("watermark_sdk_timeout")), timeoutMs);
        script.async = true;
        script.src = url;
        script.onload = () => {
          const sdk = browser.watermark;
          finish(sdk && typeof sdk.init === "function" && typeof sdk.destroyWm === "function"
            ? undefined : new Error("watermark_sdk_unavailable"));
        };
        script.onerror = () => finish(new Error("watermark_sdk_unavailable"));
        try { document.head.appendChild(script); }
        catch { finish(new Error("watermark_sdk_unavailable")); }
      });
      entry = { promise, cancel, subscribers: 0, settled: false };
      const load = entry;
      loads.set(url, load);
      void promise.then(() => { load.settled = true; }, () => {
        load.settled = true;
        if (loads.get(url) === load) loads.delete(url);
      });
    }
    const load = entry;
    load.subscribers++;
    if (!signal) return load.promise;
    return new Promise<WatermarkSdk>((resolve, reject) => {
      const abort = () => {
        load.subscribers--;
        if (!load.subscribers && !load.settled) {
          if (loads.get(url) === load) loads.delete(url);
          load.cancel();
        }
        reject(new Error("watermark_sdk_aborted"));
      };
      signal.addEventListener("abort", abort, { once: true });
      void load.promise.then(value => {
        signal.removeEventListener("abort", abort);
        if (!signal.aborted) resolve(value);
      }, error => {
        signal.removeEventListener("abort", abort);
        reject(error);
      });
    });
  };
}

/** The supplier has a single global instance and no cancellable init. Serialize it
 * even after an effect is disposed, so late completion cannot clobber a new user. */
export function createSdkCoordinator() {
  let queue: Promise<unknown> = Promise.resolve();
  let owner: symbol | null = null;
  let ownedSdk: WatermarkSdk | null = null;
  const clear = (token: symbol) => {
    if (owner !== token) return;
    try { ownedSdk?.destroyWm(); } catch { /* Supplier cleanup must not break navigation. */ }
  };
  return {
    clear,
    initialize(token: symbol, sdk: WatermarkSdk, data: WatermarkData, current: () => boolean) {
      const operation = queue.then(async () => {
        if (!current()) return null;
        owner = token;
        ownedSdk = sdk;
        clear(token);
        try {
          const result = await sdk.init({ data, conflictDetectionSwitch: true });
          if (!current()) { clear(token); return null; }
          if (!result?.ok || !["loaded", "skipped_client_watermark"].includes(result.status)) {
            clear(token);
            throw new Error("watermark_init_failed");
          }
          return result.status;
        } catch (error) {
          clear(token);
          throw error;
        }
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

export const watermarkCoordinator = createSdkCoordinator();
let browserLoader: ReturnType<typeof createSdkLoader> | undefined;
export function loadWatermarkSdk(url: string, signal?: AbortSignal) {
  browserLoader ??= createSdkLoader(window, document);
  return browserLoader(url, signal);
}

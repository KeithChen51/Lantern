import { WatermarkError, type WatermarkConfig } from "./config";

export type WebWatermarkData = {
  wmInfo: string;
  wmOpacity: number;
  lbOpacity?: number;
  dispersion?: number;
  macroRows?: number;
  macroCols?: number;
};

const MAX_RESPONSE_BYTES = 128 * 1024;
export const WATERMARK_TIMEOUT_MS = 10_000;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function watermarkData(value: unknown): WebWatermarkData {
  if (!object(value) || typeof value.wmInfo !== "string" || !value.wmInfo.trim() || value.wmInfo.length > 65_536 || typeof value.wmOpacity !== "number" || !Number.isFinite(value.wmOpacity) || value.wmOpacity < 0 || value.wmOpacity > 10) throw new Error("Invalid watermark data");
  // Invisible web watermarks only. An allowlist also prevents an upstream
  // error/debug object from exposing tenant credentials to the browser.
  const result: WebWatermarkData = { wmInfo: value.wmInfo, wmOpacity: value.wmOpacity };
  for (const name of ["lbOpacity", "dispersion", "macroRows", "macroCols"] as const) {
    if (value[name] !== undefined) {
      if (typeof value[name] !== "number" || !Number.isFinite(value[name]) || value[name] < 0 || value[name] > 1000) throw new Error("Invalid watermark parameter");
      result[name] = value[name];
    }
  }
  return result;
}

async function readResponse(response: Response): Promise<unknown> {
  if (!response.body || Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Invalid watermark response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Watermark response too large");
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}

export async function requestWebWatermark(config: WatermarkConfig, account: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<WebWatermarkData> {
  // Preserve leading zeros. IAM/portal identity is verified before this call.
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(account)) throw new WatermarkError("watermark_unavailable", 503);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, WATERMARK_TIMEOUT_MS);
  try {
    controller.signal.throwIfAborted();
    const response = await fetcher(`${config.baseUrl}/watermark/web/communicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ objectId: account, objectType: 1 }),
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Upstream unavailable");
    }
    const body = await readResponse(response);
    if (!object(body) || body.code !== 0) throw new Error("Upstream rejected watermark");
    return watermarkData(body.data);
  } catch {
    // Supplier codes, URLs, credentials and arbitrary error messages never
    // become app auth errors (or a logged/returned upstream response).
    throw new WatermarkError("watermark_unavailable", 503);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

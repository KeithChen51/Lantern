import { isIP } from "node:net";

const SDK_URLS = {
  test: "https://watermarktest.byd.com:8443/sdk/js-sdk.js",
  production: "https://watermark.byd.com:8443/sdk/js-sdk.js",
} as const;

export class WatermarkError extends Error {
  constructor(public readonly code: "watermark_disabled" | "watermark_unavailable", public readonly status: 404 | 503) {
    super(code === "watermark_disabled" ? "网页水印未启用。" : "网页水印服务暂不可用，请稍后重试。");
  }
}

export type WatermarkConfig = { baseUrl: string; apiKey: string; sdkUrl: string };

function sdkUrl(env: NodeJS.ProcessEnv): string {
  const deployment = env.LIGHTHOUSE_DEPLOYMENT_ENV ?? (env.NODE_ENV === "production" ? "production" : "development");
  if (!["production", "test", "development"].includes(deployment)) throw new WatermarkError("watermark_unavailable", 503);
  const expected = SDK_URLS[deployment === "production" ? "production" : "test"];
  // Only the official SDK for this deployment may execute in an employee page.
  if (env.WATERMARK_SDK_URL && env.WATERMARK_SDK_URL !== expected) throw new WatermarkError("watermark_unavailable", 503);
  return expected;
}

/** The only watermark configuration serialized to the browser is an SDK URL. */
export function getWatermarkSdkUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.WATERMARK_ENABLE !== "true" || env.AUTH_MODE === "guest") return null;
  try { return sdkUrl(env); }
  catch {
    console.warn("[watermark] SDK configuration is invalid; watermark initialization is disabled.");
    return null;
  }
}

/** Server only: never pass this object to a React client component. */
export function readWatermarkConfig(env: NodeJS.ProcessEnv = process.env): WatermarkConfig {
  if (env.WATERMARK_ENABLE !== "true") throw new WatermarkError("watermark_disabled", 404);
  try {
    const baseUrl = new URL(env.WATERMARK_BASE_URL ?? "");
    const octets = baseUrl.hostname.split(".").map(Number);
    const privateIpv4 = isIP(baseUrl.hostname) === 4 && (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
    // The common service may use HTTP on a configured private network. Never
    // accept caller-controlled URLs, credentials, redirects or path overrides.
    if ((baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && privateIpv4)) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== "/") throw new Error("Invalid origin");
    const apiKey = env.WATERMARK_API_KEY ?? "";
    if (!apiKey || apiKey.length > 4096 || /[^\x21-\x7e]/.test(apiKey)) throw new Error("Invalid key");
    return { baseUrl: baseUrl.origin, apiKey, sdkUrl: sdkUrl(env) };
  } catch { throw new WatermarkError("watermark_unavailable", 503); }
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { getWatermarkSdkUrl, readWatermarkConfig } from "./config";

const env: NodeJS.ProcessEnv = { NODE_ENV: "test", AUTH_MODE: "iam", LIGHTHOUSE_DEPLOYMENT_ENV: "test", WATERMARK_ENABLE: "true", WATERMARK_BASE_URL: "http://10.20.30.40:16010", WATERMARK_API_KEY: "synthetic-watermark-key" };
afterEach(() => vi.restoreAllMocks());

describe("watermark runtime configuration", () => {
  it("does nothing by default and exposes only the SDK URL to the browser", () => {
    expect(getWatermarkSdkUrl({ NODE_ENV: "test" })).toBeNull();
    expect(getWatermarkSdkUrl({ ...env, AUTH_MODE: "guest" })).toBeNull();
    expect(() => readWatermarkConfig({ NODE_ENV: "test" })).toThrow(expect.objectContaining({ status: 404 }));
    expect(getWatermarkSdkUrl(env)).toBe("https://watermarktest.byd.com:8443/sdk/js-sdk.js");
    expect(readWatermarkConfig(env)).toMatchObject({ baseUrl: env.WATERMARK_BASE_URL, apiKey: env.WATERMARK_API_KEY });
  });

  it("uses deployment identity rather than production build mode to select the test SDK", () => {
    expect(getWatermarkSdkUrl({ ...env, NODE_ENV: "production" })).toContain("watermarktest.byd.com");
    expect(getWatermarkSdkUrl({ ...env, LIGHTHOUSE_DEPLOYMENT_ENV: "production" })).toBe("https://watermark.byd.com:8443/sdk/js-sdk.js");
    expect(getWatermarkSdkUrl({ ...env, LIGHTHOUSE_DEPLOYMENT_ENV: undefined, NODE_ENV: "production" })).toContain("https://watermark.byd.com");
  });

  it.each(["http://public.example.invalid", "http://127.0.0.1", "http://169.254.169.254", "ftp://10.20.30.40", "https://user:pass@example.invalid", "https://example.invalid/path", "https://example.invalid?secret=leak", "https://example.invalid#fragment"])("rejects an invalid common service origin: %s", url => {
    expect(() => readWatermarkConfig({ ...env, WATERMARK_BASE_URL: url })).toThrow(expect.objectContaining({ status: 503 }));
  });

  it.each(["", "bad\nkey", "bad key"])("rejects missing/malformed keys without exposing them", key => {
    expect(() => readWatermarkConfig({ ...env, WATERMARK_API_KEY: key })).toThrow("网页水印服务暂不可用");
  });

  it("rejects cross-environment or arbitrary executable SDK URLs without breaking page rendering", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const url of ["https://example.invalid/sdk.js", "https://watermark.byd.com:8443/sdk/js-sdk.js"]) {
      expect(() => readWatermarkConfig({ ...env, WATERMARK_SDK_URL: url })).toThrow(expect.objectContaining({ status: 503 }));
      expect(getWatermarkSdkUrl({ ...env, WATERMARK_SDK_URL: url })).toBeNull();
    }
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.WATERMARK_API_KEY);
  });
});

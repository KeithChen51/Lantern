import { afterEach, describe, expect, it, vi } from "vitest";
import { requestWebWatermark, WATERMARK_TIMEOUT_MS } from "./service";

const config = { baseUrl: "https://watermark-common.example.invalid", apiKey: "synthetic-private-key", sdkUrl: "https://watermarktest.byd.com:8443/sdk/js-sdk.js" };
const valid = { code: 0, data: { wmInfo: "synthetic-encrypted-watermark", wmOpacity: 5, lbOpacity: 0, dispersion: 3, macroRows: 2, macroCols: 3 } };
afterEach(() => vi.useRealTimers());

describe("common-service watermark adapter", () => {
  it("sends only the trusted account and tenant key and preserves opaque algorithm data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...valid, data: { ...valid.data, secret: config.apiKey, gwMWatermarkInfo: { secret: config.apiKey } }, message: config.apiKey }));
    expect(await requestWebWatermark(config, "000042", undefined, fetcher)).toEqual(valid.data);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${config.baseUrl}/watermark/web/communicate`);
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", body: JSON.stringify({ objectId: "000042", objectType: 1 }) });
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${config.apiKey}`);
  });

  it.each([401, 403, 429, 500, 302])("maps supplier HTTP %s to a safe service failure instead of an app auth status", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(config.apiKey, { status }));
    await expect(requestWebWatermark(config, "000042", undefined, fetcher)).rejects.toMatchObject({ code: "watermark_unavailable", status: 503, message: "网页水印服务暂不可用，请稍后重试。" });
  });

  it.each([{ code: 401, message: "secret" }, { code: 0, data: { wmInfo: "", wmOpacity: 5 } }, { code: 0, data: { wmInfo: "info", wmOpacity: 99 } }, { code: 0, data: { wmInfo: "info", wmOpacity: 5, macroRows: "unexpected" } }, { code: "0", data: valid.data }])("rejects malformed or unsuccessful responses", async body => {
    await expect(requestWebWatermark(config, "000042", undefined, vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)))).rejects.toMatchObject({ status: 503 });
  });

  it("bounds streamed responses even without Content-Length", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(129 * 1024)); }, cancel }));
    await expect(requestWebWatermark(config, "000042", undefined, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toMatchObject({ status: 503 });
    expect(cancel).toHaveBeenCalled();
  });

  it.each(["", "someone\nelse", "x".repeat(81)])("never requests a watermark for an invalid identity", async account => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(requestWebWatermark(config, account, undefined, fetcher)).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels slow upstream requests at the deadline and cleans timers", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>((_, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error(config.apiKey)))));
    const promise = requestWebWatermark(config, "000042", undefined, fetcher);
    const assertion = expect(promise).rejects.toMatchObject({ status: 503, message: "网页水印服务暂不可用，请稍后重试。" });
    await vi.advanceTimersByTimeAsync(WATERMARK_TIMEOUT_MS);
    await assertion;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates request cancellation and never starts an already-aborted request", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>((_, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abort")))));
    const pending = requestWebWatermark(config, "000042", controller.signal, fetcher);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 503 });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    fetcher.mockClear();
    await expect(requestWebWatermark(config, "000042", controller.signal, fetcher)).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

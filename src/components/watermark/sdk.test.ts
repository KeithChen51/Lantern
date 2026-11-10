import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSdkLoader, type WatermarkSdk } from "./sdk";

function harness() {
  const scripts: Array<{ src: string; onload: null | (() => void); onerror: null | (() => void); remove: ReturnType<typeof vi.fn> }> = [];
  const browser = {} as Window;
  const document = {
    createElement: () => {
      const script = { src: "", onload: null, onerror: null, remove: vi.fn() };
      scripts.push(script); return script;
    },
    head: { appendChild: vi.fn() },
  } as unknown as Document;
  return { browser, scripts, load: createSdkLoader(browser, document, 1_000) };
}
const sdk: WatermarkSdk = { init: () => ({ ok: true, status: "loaded" }), destroyWm: () => {} };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("watermark SDK loader", () => {
  it("deduplicates pending and successful loads across remounts", async () => {
    const f = harness(); const first = f.load("https://official.invalid/sdk.js"), second = f.load("https://official.invalid/sdk.js");
    expect(first).toBe(second); expect(f.scripts).toHaveLength(1);
    f.browser.watermark = sdk; f.scripts[0].onload!();
    await expect(first).resolves.toBe(sdk); expect(f.load("https://official.invalid/sdk.js")).toBe(first);
  });
  it("removes a failed script and retries", async () => {
    const f = harness(); const first = f.load("url"); const rejected = expect(first).rejects.toThrow("watermark_sdk_unavailable");
    f.scripts[0].onerror!(); await rejected; expect(f.scripts[0].remove).toHaveBeenCalledOnce();
    const next = f.load("url"); expect(f.scripts).toHaveLength(2);
    f.browser.watermark = sdk; f.scripts[1].onload!(); await expect(next).resolves.toBe(sdk);
  });
  it("times out and permits a later retry", async () => {
    const f = harness(); const first = f.load("url"); const rejected = expect(first).rejects.toThrow("watermark_sdk_timeout");
    await vi.advanceTimersByTimeAsync(1_000); await rejected;
    expect(f.scripts[0].onload).toBeNull(); expect(f.scripts[0].remove).toHaveBeenCalledOnce();
    const next = f.load("url"); f.browser.watermark = sdk; f.scripts[1].onload!(); await expect(next).resolves.toBe(sdk);
  });
  it("rejects missing SDK methods instead of caching a false success", async () => {
    const f = harness(); const first = f.load("url"); const rejected = expect(first).rejects.toThrow("watermark_sdk_unavailable");
    f.scripts[0].onload!(); await rejected;
    expect(f.scripts[0].remove).toHaveBeenCalledOnce();
  });
  it("cancels the script after the last interested effect leaves, then permits remount", async () => {
    const f = harness(), owner = new AbortController();
    const pending = f.load("url", owner.signal); const rejected = expect(pending).rejects.toThrow("watermark_sdk_aborted");
    owner.abort(); await rejected;
    expect(f.scripts[0].remove).toHaveBeenCalledOnce();
    const next = f.load("url", new AbortController().signal);
    f.browser.watermark = sdk; f.scripts[1].onload!(); await expect(next).resolves.toBe(sdk);
  });
  it("does not cancel a shared load while another effect still needs it", async () => {
    const f = harness(), old = new AbortController(), next = new AbortController();
    const first = f.load("url", old.signal), second = f.load("url", next.signal);
    const rejected = expect(first).rejects.toThrow("watermark_sdk_aborted"); old.abort(); await rejected;
    expect(f.scripts[0].remove).not.toHaveBeenCalled();
    f.browser.watermark = sdk; f.scripts[0].onload!(); await expect(second).resolves.toBe(sdk);
  });
});

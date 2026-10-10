import { afterEach, describe, expect, it, vi } from "vitest";
import { currentVersion } from "@/lib/releases";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe("release read state", () => {
  it("stores the exact displayed version and notifies other mounted navigation instances", async () => {
    const storage = { setItem: vi.fn() };
    const dispatchEvent = vi.fn();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { dispatchEvent });
    const { markCurrentReleaseRead, RELEASE_READ_KEY } = await import("./release-read-state");
    markCurrentReleaseRead();
    expect(storage.setItem).toHaveBeenCalledWith(RELEASE_READ_KEY, currentVersion);
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
  it("still notifies the UI when browser storage is blocked", async () => {
    vi.stubGlobal("localStorage", { setItem() { throw new Error("Blocked"); } });
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    const { markCurrentReleaseRead } = await import("./release-read-state");
    expect(() => markCurrentReleaseRead()).not.toThrow();
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
});

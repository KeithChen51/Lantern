import { afterEach, describe, expect, it, vi } from "vitest";
import { latestUserFacingVersion } from "@/lib/releases";

vi.mock("react", () => ({ useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => boolean) => getSnapshot() }));
afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock("@/lib/releases"); vi.resetModules(); });
describe("release read state", () => {
  it("stores the exact displayed version and notifies other mounted navigation instances", async () => {
    const storage = { setItem: vi.fn() };
    const dispatchEvent = vi.fn();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { dispatchEvent });
    const { markCurrentReleaseRead, RELEASE_READ_KEY } = await import("./release-read-state");
    markCurrentReleaseRead();
    expect(storage.setItem).toHaveBeenCalledWith(RELEASE_READ_KEY, latestUserFacingVersion);
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
  it("does not show a new badge for a maintenance version after the latest user notes were read", async () => {
    vi.doMock("@/lib/releases", () => ({ currentVersion: "1.3.6", latestUserFacingVersion: "1.3.5" }));
    const storage = { getItem: vi.fn(() => "1.3.5"), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const { useReleaseUnread, markCurrentReleaseRead, RELEASE_READ_KEY } = await import("./release-read-state");
    expect(useReleaseUnread()).toBe(false);
    markCurrentReleaseRead();
    expect(storage.setItem).toHaveBeenCalledWith(RELEASE_READ_KEY, "1.3.5");
  });
  it("still shows unread user changes across a maintenance release", async () => {
    vi.doMock("@/lib/releases", () => ({ currentVersion: "1.3.6", latestUserFacingVersion: "1.3.5" }));
    vi.stubGlobal("localStorage", { getItem: () => "1.3.4" });
    const { useReleaseUnread } = await import("./release-read-state");
    expect(useReleaseUnread()).toBe(true);
  });
  it("does not require browser storage when there are no user-facing updates", async () => {
    vi.doMock("@/lib/releases", () => ({ currentVersion: "1.3.6", latestUserFacingVersion: null }));
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    const { useReleaseUnread, markCurrentReleaseRead } = await import("./release-read-state");
    expect(useReleaseUnread()).toBe(false);
    expect(markCurrentReleaseRead).not.toThrow();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

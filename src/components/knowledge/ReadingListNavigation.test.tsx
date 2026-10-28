import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ effect: undefined as undefined | (() => (() => void) | void) }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: (effect: () => (() => void) | void) => { harness.effect = effect; } }));
import { ReadingEntryLink, ReadingListPosition } from "./ReadingListNavigation";
import { readingPositionKey } from "./reading-return";

const returnTo = "/action?q=客户&tag=服务";
let savedAt: number;
let snapshot: string;
let storage: Map<string, string>;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let page: { scrollY: number; innerHeight: number; scrollTo: ReturnType<typeof vi.fn>; location: { hash: string }; history: { state: Record<string, unknown>; replaceState: ReturnType<typeof vi.fn> } };
let focus: ReturnType<typeof vi.fn>;
beforeEach(() => {
  savedAt = Date.now(); snapshot = JSON.stringify({ y: 2101, anchor: "resource-a", savedAt });
  storage = new Map([[readingPositionKey(returnTo), snapshot]]); frames = new Map(); nextFrame = 0; focus = vi.fn();
  page = { scrollY: 2101, innerHeight: 900, scrollTo: vi.fn(), location: { hash: "" }, history: { state: { __NA: true }, replaceState: vi.fn((state: Record<string, unknown>) => { page.history.state = state; }) } };
  vi.stubGlobal("window", page);
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => frames.delete(frame));
  vi.stubGlobal("document", { documentElement: { scrollHeight: 5000 }, getElementById: () => ({ focus }) });
});
afterEach(() => vi.unstubAllGlobals());
function runFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); }
function setup() { ReadingListPosition({ returnTo }); return harness.effect?.(); }

describe("reading list position lifecycle", () => {
  it("does not consume an unexecuted snapshot during StrictMode effect replay", () => {
    page.history.state.lighthouseReadingReturn = { returnTo, savedAt };
    const cleanup = setup(); cleanup?.();
    expect(storage.get(readingPositionKey(returnTo))).toBe(snapshot);
    expect(page.scrollTo).not.toHaveBeenCalled();
    setup(); runFrames();
    expect(page.scrollTo).toHaveBeenCalledWith({ top: 2101, behavior: "instant" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(storage.has(readingPositionKey(returnTo))).toBe(false);
  });
  it("ignores stale snapshots on a fresh visit to the same list", () => {
    setup(); runFrames();
    expect(page.scrollTo).not.toHaveBeenCalled();
    expect(storage.get(readingPositionKey(returnTo))).toBe(snapshot);
  });
  it("restores an explicit article return link without requiring a history marker", () => {
    page.location.hash = "#resource-a";
    setup(); runFrames();
    expect(page.scrollTo).toHaveBeenCalledOnce();
    expect(storage.has(readingPositionKey(returnTo))).toBe(false);
  });
  it("does not consume a newer snapshot written before the old frame runs", () => {
    page.location.hash = "#resource-a";
    setup(); const newer = JSON.stringify({ y: 2400, anchor: "resource-b", savedAt: savedAt + 1 });
    storage.set(readingPositionKey(returnTo), newer); runFrames();
    expect(storage.get(readingPositionKey(returnTo))).toBe(newer);
  });
  it("marks only the originating browser entry while keeping Next history fields", () => {
    const link = ReadingEntryLink({ href: "/resources/a?version=v1", returnTo, entryId: "resource-a", children: "案例" });
    link.props.onClick({ defaultPrevented: false, button: 0 });
    expect(page.history.state).toMatchObject({ __NA: true, lighthouseReadingReturn: { returnTo } });
    expect(JSON.parse(storage.get(readingPositionKey(returnTo))!)).toMatchObject({ y: 2101, anchor: "resource-a" });
  });
});

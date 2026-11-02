import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  slot: 0, refSlot: 0, states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>, effect: null as null | (() => (() => void)), fetch: vi.fn(),
  expiresAt: 0,
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.slot++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
  },
  useRef: (initial: unknown) => { const index = harness.refSlot++; return harness.refs[index] ??= { current: initial }; },
  useEffect: (effect: () => (() => void)) => { harness.effect = effect; },
}));
vi.mock("@/components/auth/SessionContext", () => ({
  useEmployeeSession: () => ({ kind: "employee", user: { id: "owner" }, capabilities: ["analytics:summary"], expiresAt: harness.expiresAt }),
}));
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: (...args: unknown[]) => harness.fetch(...args) }));
import { EmployeeRankings } from "./EmployeeRankings";

const period = { startDate: "2026-10-01", endDate: "2026-10-31" };
const privateResult = {
  period,
  visits: { rows: [{ rank: 1, employee: "PRIVATE_EMPLOYEE", visits: 7 }], note: "" },
  ai: { rows: [{ rank: 1, employee: "AI_EMPLOYEE", conversations: 2, turns: 5 }], note: "" },
};
let page: EventTarget;
let documentEvents: EventTarget & { visibilityState: string };
let cleanup: (() => void) | undefined;
function nodes(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [...(element.type === type ? [element as ReactElement<Record<string, unknown>>] : []), ...nodes(element.props.children, type)];
}
function render(): ReactNode {
  harness.slot = 0; harness.refSlot = 0;
  const root = EmployeeRankings({ period }) as ReactElement<{ children: ReactElement[] }>;
  const data = root.props.children.at(-1)!;
  return (data.type as (props: unknown) => ReactNode)(data.props);
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node ? text((node as ReactElement<{ children?: ReactNode }>).props.children) : "";
}
function visibility(state: string) {
  documentEvents.visibilityState = state;
  documentEvents.dispatchEvent(new Event("visibilitychange"));
}
function restored() {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  page.dispatchEvent(event);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T08:00:00Z"));
  vi.clearAllMocks();
  harness.states = []; harness.refs = []; harness.effect = null;
  harness.expiresAt = Date.now() + 60_000;
  page = new EventTarget();
  documentEvents = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", documentEvents);
  vi.stubGlobal("window", Object.assign(page, { setTimeout, clearTimeout }));
  harness.fetch.mockImplementation(() => Promise.resolve(Response.json(privateResult)));
  render();
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("automatic employee ranking lifecycle", () => {
  it("loads both named rankings once without a form or reason", async () => {
    cleanup = harness.effect!();
    expect(harness.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(harness.fetch.mock.calls[0][1].body)).toEqual({ start: period.startDate, end: period.endDate });
    expect(text(render())).toContain("PRIVATE_EMPLOYEE");
    expect(text(render())).toContain("AI_EMPLOYEE");
    expect(nodes(render(), "form")).toHaveLength(0);
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    page.dispatchEvent(new Event("pageshow"));
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
  it("coalesces Strict Mode setup and cleanup before an audited request starts", async () => {
    const effect = harness.effect!;
    effect()();
    cleanup = effect();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["pagehide", "hidden", "restored"])("clears named rows on %s and reloads once when visible", async event => {
    cleanup = harness.effect!();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(render())).toContain("PRIVATE_EMPLOYEE");
    if (event === "pagehide") page.dispatchEvent(new Event("pagehide"));
    if (event === "hidden") visibility("hidden");
    if (event === "restored") restored();
    expect(text(render())).not.toContain("PRIVATE_EMPLOYEE");
    visibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(2);
    expect(text(render())).toContain("PRIVATE_EMPLOYEE");
  });
  it("waits for an initially hidden page to become visible", async () => {
    documentEvents.visibilityState = "hidden";
    cleanup = harness.effect!();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).not.toHaveBeenCalled();
    visibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not request names if the session expired before hydration", async () => {
    harness.expiresAt = Date.now() - 1;
    render();
    cleanup = harness.effect!();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(text(render())).toContain("登录已失效");
  });
  it("does not reveal an in-flight response after the page has been hidden", async () => {
    let finish!: (response: Response) => void;
    harness.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    cleanup = harness.effect!();
    await vi.advanceTimersByTimeAsync(0);
    visibility("hidden");
    finish(Response.json(privateResult));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(text(render())).not.toContain("PRIVATE_EMPLOYEE");
  });
  it("clears names when the session expires and does not reload on visibility events", async () => {
    cleanup = harness.effect!();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(text(render())).not.toContain("PRIVATE_EMPLOYEE");
    expect(text(render())).toContain("登录已失效");
    visibility("hidden"); visibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
  it("offers retry after a failed load and merges repeated retries", async () => {
    harness.fetch.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    cleanup = harness.effect!();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(render())).toContain("员工榜单加载失败");
    const button = nodes(render(), "button")[0];
    (button.props.onClick as () => void)();
    (button.props.onClick as () => void)();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(2);
    expect(text(render())).toContain("PRIVATE_EMPLOYEE");
  });
  it("refuses a response for another report period", async () => {
    harness.fetch.mockImplementationOnce(() => Promise.resolve(Response.json({ ...privateResult, period: { ...period, endDate: "2026-10-20" } })));
    cleanup = harness.effect!();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(render())).not.toContain("PRIVATE_EMPLOYEE");
    expect(text(render())).toContain("员工榜单加载失败");
  });
  it("shows empty states for both rankings when the selected period has no employee records", async () => {
    harness.fetch.mockImplementationOnce(() => Promise.resolve(Response.json({
      ...privateResult, visits: { rows: [], note: "" }, ai: { rows: [], note: "" },
    })));
    cleanup = harness.effect!();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(render())).toContain("暂无可展示的员工访问记录");
    expect(text(render())).toContain("暂无可展示的员工 AI 对话记录");
    expect(nodes(render(), "table")).toHaveLength(0);
  });
});

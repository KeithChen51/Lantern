import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  stateSlot: 0, effectSlot: 0, states: [] as unknown[],
  effects: [] as Array<{ deps: unknown[]; setup: () => void | (() => void); cleanup?: () => void; pending: boolean }>,
}));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const slot = hooks.stateSlot++;
    if (!(slot in hooks.states)) hooks.states[slot] = typeof initial === "function" ? initial() : initial;
    return [hooks.states[slot], (next: unknown) => { hooks.states[slot] = typeof next === "function" ? next(hooks.states[slot]) : next; }];
  },
  useEffect: (setup: () => void | (() => void), deps: unknown[]) => {
    const slot = hooks.effectSlot++;
    const previous = hooks.effects[slot];
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) hooks.effects[slot] = { setup, deps, cleanup: previous?.cleanup, pending: true };
  },
}));
import { boardRequest, useBoardResource } from "./board-client";

function render<T>(component: () => T): T {
  hooks.stateSlot = 0; hooks.effectSlot = 0;
  const value = component();
  for (const effect of hooks.effects) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.setup() ?? undefined; effect.pending = false; }
  return value;
}
function unmount() { for (const effect of hooks.effects) effect.cleanup?.(); hooks.states = []; hooks.effects = []; }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
beforeEach(() => { hooks.states = []; hooks.effects = []; });
afterEach(() => { unmount(); vi.unstubAllGlobals(); });

describe("private board resource lifecycle", () => {
  it.each([401, 403])("clears both private resources on a %s mutation without silently retrying the write", async (status) => {
    const fetcher = vi.fn().mockImplementation((url: string, init?: RequestInit) => Promise.resolve(init?.method ? Response.json({ error: { message: "denied" } }, { status }) : Response.json({ data: { secret: url } })));
    vi.stubGlobal("fetch", fetcher);
    const ResourceHarness = () => ({ feed: useBoardResource<{ secret: string }>("/api/feedback?mine=true", `denied-${status}`), notifications: useBoardResource<{ secret: string }>("/api/feedback/notifications", `denied-${status}`) });
    render(ResourceHarness); await flush();
    expect(render(ResourceHarness).feed.data?.secret).toContain("mine=true");
    expect(render(ResourceHarness).notifications.data).toBeDefined();
    await expect(boardRequest("/api/feedback", { method: "POST", body: { title: "draft" }, csrfToken: "stale" }, `denied-${status}`)).rejects.toThrow("刷新页面");
    const denied = render(ResourceHarness);
    expect(denied.feed.data).toBeUndefined(); expect(denied.notifications.data).toBeUndefined();
    expect(denied.feed.error).toContain("重新登录员工账号");
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("does not restore a late private response or an old update callback after authorization failed", async () => {
    let resolveOld!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce(Response.json({ error: { message: "denied" } }, { status: 401 })));
    const ResourceHarness = () => useBoardResource<{ secret: string }>("/api/feedback/notifications", "late-denied");
    const pending = render(ResourceHarness);
    await expect(boardRequest("/api/feedback/1/like", { method: "PUT", csrfToken: "stale" }, "late-denied")).rejects.toThrow();
    resolveOld(Response.json({ data: { secret: "must not return" } }));
    await flush();
    pending.update({ secret: "late mutation must not return" });
    expect(render(ResourceHarness).data).toBeUndefined();
    expect(render(ResourceHarness).error).toContain("刷新页面");
  });

  it("clears data on a rejected GET reload, but can recover with an explicit fresh GET", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: { secret: "first" } })).mockResolvedValueOnce(Response.json({ error: { message: "denied" } }, { status: 403 })).mockResolvedValueOnce(Response.json({ data: { secret: "fresh" } }));
    vi.stubGlobal("fetch", fetcher);
    const ResourceHarness = () => useBoardResource<{ secret: string }>("/api/feedback?mine=true", "get-recovery");
    render(ResourceHarness); await flush();
    render(ResourceHarness).reload(); render(ResourceHarness); await flush();
    expect(render(ResourceHarness).data).toBeUndefined();
    render(ResourceHarness).reload(); render(ResourceHarness); await flush();
    expect(render(ResourceHarness).data).toEqual({ secret: "fresh" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("keeps an ordinary failed refresh recoverable without erasing authorized data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ data: { note: "latest authorized detail" } })).mockRejectedValueOnce(new Error("offline")));
    const ResourceHarness = () => useBoardResource<{ note: string }>("/api/feedback/1", "network-recovery");
    render(ResourceHarness); await flush();
    render(ResourceHarness).reload(); render(ResourceHarness); await flush();
    expect(render(ResourceHarness).data?.note).toBe("latest authorized detail");
    expect(render(ResourceHarness).error).toBe("offline");
  });

  it("never exposes owner A data to owner B or applies A's pending response after the owner changes", async () => {
    let resolveOld!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce(Response.json({ data: { secret: "owner B" } })));
    let owner = "switch-A";
    const ResourceHarness = () => useBoardResource<{ secret: string }>("/api/feedback?mine=true", owner);
    render(ResourceHarness);
    owner = "switch-B";
    expect(render(ResourceHarness).data).toBeUndefined();
    await flush();
    expect(render(ResourceHarness).data).toEqual({ secret: "owner B" });
    resolveOld(Response.json({ data: { secret: "owner A" } })); await flush();
    expect(render(ResourceHarness).data).toEqual({ secret: "owner B" });
  });
});

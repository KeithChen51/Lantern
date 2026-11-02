import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  owner: "list", slot: 0, refSlot: 0,
  states: {} as Record<string, unknown[]>, refs: {} as Record<string, Array<{ current: unknown }>>,
  effects: [] as Array<() => void | (() => void)>, fetch: vi.fn(), expiresAt: 0, allowed: true,
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const values = harness.states[harness.owner] ??= [];
    const index = harness.slot++;
    if (!(index in values)) values[index] = initial;
    return [values[index], (value: unknown) => { values[index] = typeof value === "function" ? value(values[index]) : value; }];
  },
  useRef: (initial: unknown) => {
    const refs = harness.refs[harness.owner] ??= [];
    return refs[harness.refSlot++] ??= { current: initial };
  },
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
  useCallback: (callback: unknown) => callback,
}));
vi.mock("@/components/auth/SessionContext", () => ({ useEmployeeSession: () => ({
  kind: "employee", user: { id: "admin" }, expiresAt: harness.expiresAt,
  capabilities: harness.allowed ? ["analytics:summary"] : ["knowledge:manage"],
}) }));
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: (...args: unknown[]) => harness.fetch(...args) }));
import { HermitRecords } from "./HermitRecords";

type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function nodes(node: ReactNode, predicate: (node: Element) => boolean): Element[] {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [...(predicate(element) ? [element] : []), ...nodes(element.props.children, predicate)];
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node ? text((node as Element).props.children) : "";
}
function invoke(owner: string, component: Element): ReactNode {
  harness.owner = owner; harness.slot = 0; harness.refSlot = 0; harness.effects = [];
  return (component.type as (props: unknown) => ReactNode)(component.props);
}
function list(canReadContent = true) { return invoke("list", HermitRecords({ canReadContent }) as Element); }
function modal(canReadContent = true) {
  const component = nodes(list(canReadContent), node => typeof node.type === "function" && node.type.name === "ConversationWindow")[0];
  expect(component).toBeDefined();
  return invoke("modal", component);
}
function button(node: ReactNode, label: string) {
  return nodes(node, node => node.type === "button" && text(node) === label)[0];
}
function click(node: Element) { (node.props.onClick as (event: unknown) => void)({ currentTarget: trigger }); }
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
let documentEvents: EventTarget & { visibilityState: string; documentElement: { style: { overflow: string } } };
let page: EventTarget;
let cleanup: Array<() => void>;
const trigger = { isConnected: true, focus: vi.fn() };
const row = { id: "session-fixture", actor: "employee", createdAt: "2026-11-01T16:00:00Z", lastQuestionAt: "2026-11-02T00:00:00Z", turns: 2 };

async function loadedList() {
  list();
  for (const effect of harness.effects) { const dispose = effect(); if (dispose) cleanup.push(dispose); }
  await vi.advanceTimersByTimeAsync(0);
  const tree = list();
  click(nodes(tree, node => node.type === "button" && node.props["aria-label"] === `回看会话 ${row.id}`)[0]);
  return tree;
}
function openedModal(canReadContent = true) {
  const tree = modal(canReadContent);
  const dialog = { showModal: vi.fn(), close: vi.fn() };
  harness.refs.modal[0].current = dialog;
  for (const effect of harness.effects) { const dispose = effect(); if (dispose) cleanup.push(dispose); }
  return tree;
}
async function authorize() {
  let tree = modal();
  const input = nodes(tree, node => node.type === "textarea")[0];
  (input.props.onChange as (event: unknown) => void)({ target: { value: "排查员工反馈的回答" } });
  tree = modal();
  const form = nodes(tree, node => node.type === "form")[0];
  (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T02:00:00Z")); vi.clearAllMocks();
  harness.states = {}; harness.refs = {}; harness.effects = []; harness.expiresAt = Date.now() + 60_000; harness.allowed = true;
  cleanup = [];
  documentEvents = Object.assign(new EventTarget(), { visibilityState: "visible", documentElement: { style: { overflow: "auto" } } });
  page = new EventTarget();
  vi.stubGlobal("document", documentEvents);
  vi.stubGlobal("window", Object.assign(page, { setTimeout, clearTimeout }));
  harness.fetch.mockImplementation((url: string) => Promise.resolve(Response.json(url.includes("/content") ? { messages: [{ id: "u1", role: "user", text: "PRIVATE_QUESTION" }, { id: "a1", role: "assistant", text: "PRIVATE_ANSWER" }], nextCursor: null } : { rows: [row], nextCursor: null })));
});
afterEach(() => { cleanup.reverse().forEach(dispose => dispose()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("路引记录列表与正文边界", () => {
  it("renders filters without requesting or including transcript content", () => {
    const html = renderToStaticMarkup(list());
    expect(html).toContain("完整会话编号");
    expect(html).not.toContain("PRIVATE_");
    expect(harness.fetch).not.toHaveBeenCalled();
  });
  it("loads list metadata and opens a reason form without a content request", async () => {
    await loadedList();
    const tree = openedModal();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(text(tree)).toContain("查看事由");
    expect(text(tree)).not.toContain("PRIVATE_");
    expect(nodes(tree, node => node.type === "textarea")).toHaveLength(1);
  });
  it("keeps list-only administrators out of the content form", async () => {
    await loadedList();
    const tree = openedModal(false);
    expect(text(tree)).toContain("专项权限");
    expect(nodes(tree, node => node.type === "textarea")).toHaveLength(0);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
  it("POSTs one bounded reason inside the modal and renders an inert conversation", async () => {
    await loadedList(); openedModal(); await authorize();
    const [url, init] = harness.fetch.mock.calls[1];
    expect(url).toBe("/api/admin/hermit-records/content");
    expect(JSON.parse(init.body)).toEqual({ id: row.id, purpose: "排查员工反馈的回答" });
    const html = renderToStaticMarkup(modal());
    expect(html).toContain("PRIVATE_QUESTION");
    expect(html).toContain("PRIVATE_ANSWER");
    expect(html.indexOf("PRIVATE_QUESTION")).toBeLessThan(html.indexOf("PRIVATE_ANSWER"));
    expect(html).not.toContain("textarea");
    expect(html).not.toContain("继续提问");
  });
  it("renders markdown tables and citation labels without links, images or raw HTML", async () => {
    await loadedList(); openedModal();
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [{ id: "a", role: "assistant", text: "|列|值|\n|---|---|\n|A|B|\n\n[1](#hermit-citation-1) [外链](https://private.invalid) ![图片](https://tracker.invalid/pixel) <script>bad()</script>" }], nextCursor: null }));
    await authorize();
    const html = renderToStaticMarkup(modal());
    expect(html).toContain("<table>");
    expect(html).toContain("外链");
    expect(html).toContain("[1]");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("private.invalid");
    expect(html).not.toContain("tracker.invalid");
  });
  it("merges later message pages without repeating messages", async () => {
    await loadedList(); openedModal();
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [{ id: "u1", role: "user", text: "FIRST" }], nextCursor: "next" }));
    await authorize();
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [{ id: "u1", role: "user", text: "FIRST" }, { id: "a1", role: "assistant", text: "SECOND" }], nextCursor: null }));
    click(button(modal(), "继续读取后续对话")); await settle();
    const html = renderToStaticMarkup(modal());
    expect(html.match(/FIRST/g)).toHaveLength(1);
    expect(html).toContain("SECOND");
    expect(JSON.parse(harness.fetch.mock.calls[2][1].body).cursor).toBe("next");
  });
  it("shows an empty saved session accurately", async () => {
    await loadedList(); openedModal();
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [], nextCursor: null }));
    await authorize();
    expect(text(modal())).toContain("暂无已保存的提问或回复");
  });
  it("marks long transcripts that include stored retry attempts", async () => {
    await loadedList(); openedModal();
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [], nextCursor: null, view: "stored-attempts" }));
    await authorize();
    expect(text(modal())).toContain("包含重试回答");
  });
  it("does not send a short purpose even if the form submit handler is invoked", async () => {
    await loadedList(); openedModal();
    const form = nodes(modal(), node => node.type === "form")[0];
    (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
    await settle();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
  it("aborts a read on unmount and ignores its eventual response", async () => {
    await loadedList(); openedModal();
    let resolve!: (response: Response) => void;
    harness.fetch.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    await authorize();
    const signal = harness.fetch.mock.calls[1][1].signal as AbortSignal;
    cleanup.pop()!();
    expect(signal.aborted).toBe(true);
    resolve(Response.json({ messages: [{ id: "late", role: "user", text: "LATE_PRIVATE_TEXT" }], nextCursor: null }));
    await settle();
    expect(renderToStaticMarkup(modal())).not.toContain("LATE_PRIVATE_TEXT");
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(documentEvents.documentElement.style.overflow).toBe("auto");
  });
  it("waits to load an initially hidden page until it is visible", async () => {
    documentEvents.visibilityState = "hidden";
    list();
    for (const effect of harness.effects) { const dispose = effect(); if (dispose) cleanup.push(dispose); }
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).not.toHaveBeenCalled();
    documentEvents.visibilityState = "visible";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
  it("clears already read text after a failed later page", async () => {
    await loadedList(); openedModal();
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [{ id: "u1", role: "user", text: "PRIVATE_QUESTION" }], nextCursor: "next" }));
    await authorize();
    harness.fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    click(button(modal(), "继续读取后续对话")); await settle();
    const html = renderToStaticMarkup(modal());
    expect(html).not.toContain("PRIVATE_QUESTION");
    expect(html).toContain("请确认授权仍有效");
  });
  it("closes the read window when the page becomes hidden", async () => {
    await loadedList(); openedModal(); await authorize();
    documentEvents.visibilityState = "hidden";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    expect(nodes(list(), node => typeof node.type === "function" && node.type.name === "ConversationWindow")).toHaveLength(0);
  });
  it.each(["pagehide", "pageshow"])("discards selected content on %s", async event => {
    await loadedList(); openedModal();
    page.dispatchEvent(new Event(event));
    expect(nodes(list(), node => typeof node.type === "function" && node.type.name === "ConversationWindow")).toHaveLength(0);
  });
  it("removes records and closes the window at session expiry", async () => {
    await loadedList(); openedModal();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(text(list())).toContain("登录已失效");
    expect(text(list())).not.toContain(row.id);
  });
});

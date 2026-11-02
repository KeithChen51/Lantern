import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HermitConversationView } from "@/components/hermit/HermitConversationView";
import { ConversationHeader } from "@/components/hermit/ConversationHeader";

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
  if (element.type === HermitConversationView) return nodes(HermitConversationView(element.props as Parameters<typeof HermitConversationView>[0]), predicate);
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
function list() { return invoke("list", HermitRecords() as Element); }
function modal() {
  const component = nodes(list(), node => typeof node.type === "function" && node.type.name === "ConversationWindow")[0];
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
function openedModal() {
  const tree = modal();
  const dialog = { showModal: vi.fn(), close: vi.fn() };
  harness.refs.modal[0].current = dialog;
  for (const effect of harness.effects) { const dispose = effect(); if (dispose) cleanup.push(dispose); }
  return tree;
}
async function readAutomatically() {
  await vi.advanceTimersByTimeAsync(0);
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
  it("exposes the compact filter toggle state and closes its panel with Escape", () => {
    expect(button(list(), "筛选条件").props["aria-expanded"]).toBe(false);
    click(button(list(), "筛选条件"));
    expect(button(list(), "筛选条件").props["aria-expanded"]).toBe(true);
    const focus = vi.fn();
    harness.refs.list[6].current = { focus };
    const form = nodes(list(), node => node.type === "form")[0];
    (form.props.onKeyDown as (event: unknown) => void)({ key: "Escape", preventDefault() {}, stopPropagation() {} });
    expect(button(list(), "筛选条件").props["aria-expanded"]).toBe(false);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it("collapses the compact filter panel after submitting its conditions", () => {
    click(button(list(), "筛选条件"));
    const form = nodes(list(), node => node.type === "form")[0];
    (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
    expect(button(list(), "筛选条件").props["aria-expanded"]).toBe(false);
  });
  it("loads list metadata and starts a content read only after opening the window", async () => {
    await loadedList();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    const tree = openedModal();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(tree)).toContain("正在读取对话");
    expect(nodes(tree, node => node.type === "textarea")).toHaveLength(0);
    await readAutomatically();
    expect(harness.fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps knowledge-only administrators outside the records workspace", () => {
    harness.allowed = false;
    expect(text(HermitRecords())).toContain("平台管理员账号");
    expect(harness.fetch).not.toHaveBeenCalled();
  });
  it("POSTs only the record id and renders a read-only conversation", async () => {
    await loadedList(); openedModal(); await readAutomatically();
    const [url, init] = harness.fetch.mock.calls[1];
    expect(url).toBe("/api/admin/hermit-records/content");
    expect(JSON.parse(init.body)).toEqual({ id: row.id });
    const html = renderToStaticMarkup(modal());
    expect(html).toContain("PRIVATE_QUESTION");
    expect(html).toContain("PRIVATE_ANSWER");
    expect(html.indexOf("PRIVATE_QUESTION")).toBeLessThan(html.indexOf("PRIVATE_ANSWER"));
    expect(html).not.toContain("textarea");
    expect(html).not.toContain("查看事由");
    expect(html).not.toContain("继续提问");
  });
  it("shows trusted employee numbers and marks older records as current profile data", async () => {
    harness.fetch.mockResolvedValueOnce(Response.json({ rows: [{ ...row, identity: { employeeNo: "EMP-001", account: "account-one", organization: "集团 / 售后服务", source: "current-profile" } }], nextCursor: null }));
    await loadedList();
    const html = renderToStaticMarkup(list());
    expect(html).toContain("工号 EMP-001");
    expect(html).toContain("集团 / 售后服务");
    expect(html).toContain("当前资料");
    expect(html).not.toContain("account-one");
    openedModal();
    expect(renderToStaticMarkup(modal())).toContain("不代表会话发生时的工号与组织");
  });
  it("labels account-only identities as login accounts and preserves snapshot provenance", async () => {
    harness.fetch.mockResolvedValueOnce(Response.json({ rows: [{ ...row, identity: { employeeNo: null, account: "portal-001", organization: "服务部", source: "session-snapshot" } }], nextCursor: null }));
    await loadedList();
    const html = renderToStaticMarkup(list());
    expect(html).toContain("登录账号 portal-001");
    expect(html).not.toContain("工号 portal-001");
    expect(html).toContain("会话资料快照");
  });
  it("does not display identity payloads for guests", async () => {
    harness.fetch.mockResolvedValueOnce(Response.json({ rows: [{ ...row, actor: "guest", identity: { employeeNo: "GUEST_PRIVATE", account: "GUEST_ACCOUNT", organization: "GUEST_ORG", source: "current-profile" } }], nextCursor: null }));
    await loadedList();
    const html = renderToStaticMarkup(list());
    expect(html).toContain("访客");
    expect(html).not.toContain("GUEST_");
    openedModal();
    expect(renderToStaticMarkup(modal())).not.toContain("GUEST_");
  });
  it("provides previous and next pages outside the scrollable table and resets only table scroll", async () => {
    harness.fetch.mockResolvedValueOnce(Response.json({ rows: [row], nextCursor: "page-two" }));
    await loadedList();
    const scroll = { scrollTop: 300 };
    harness.refs.list[1].current = scroll;
    harness.fetch.mockResolvedValueOnce(Response.json({ rows: [{ ...row, id: "second-session" }], nextCursor: null }));
    click(button(list(), "下一页")); await settle();
    expect(harness.fetch.mock.calls[1][0]).toContain("cursor=page-two");
    expect(scroll.scrollTop).toBe(0);
    const html = renderToStaticMarkup(list());
    expect(html).toContain("第 2 页");
    expect(html).toContain("second-session");
    expect(html).not.toContain("session-fixture");
    harness.fetch.mockResolvedValueOnce(Response.json({ rows: [row], nextCursor: "page-two" }));
    click(button(list(), "上一页")); await settle();
    expect(harness.fetch.mock.calls[2][0]).not.toContain("cursor=");
    expect(renderToStaticMarkup(list())).toContain("第 1 页");
    expect(renderToStaticMarkup(list())).not.toContain("选择日期可查看");
  });
  it("renders markdown tables and citation labels without links, images or raw HTML", async () => {
    await loadedList(); openedModal();
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [{ id: "a", role: "assistant", text: "|列|值|\n|---|---|\n|A|B|\n\n[1](#hermit-citation-1) [外链](https://private.invalid) ![图片](https://tracker.invalid/pixel) <script>bad()</script>" }], nextCursor: null }));
    await readAutomatically();
    const html = renderToStaticMarkup(modal());
    expect(html).toContain("data-lh-message-table");
    expect(html).toContain("data-lh-hermit-identity");
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
    await readAutomatically();
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
    await readAutomatically();
    expect(text(modal())).toContain("暂无已保存的提问或回复");
  });
  it("marks long transcripts that include stored retry attempts", async () => {
    await loadedList(); openedModal();
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [], nextCursor: null, view: "stored-attempts" }));
    await readAutomatically();
    expect(renderToStaticMarkup(modal())).toContain("包含重试回答");
  });
  it("coalesces Strict Mode setup into one content read and ignores an obsolete native close", async () => {
    await loadedList();
    const tree = openedModal();
    const effect = harness.effects[0];
    cleanup.pop()!();
    const dispose = effect();
    if (dispose) cleanup.push(dispose);
    const dialog = nodes(tree, node => node.type === "dialog")[0];
    (dialog.props.onClose as (event: unknown) => void)({ currentTarget: { open: true } });
    await readAutomatically();
    expect(harness.fetch.mock.calls.filter(call => call[0].includes("/content"))).toHaveLength(1);
    expect(renderToStaticMarkup(modal())).toContain("PRIVATE_QUESTION");
  });
  it("aborts a read on unmount and ignores its eventual response", async () => {
    await loadedList(); openedModal();
    let resolve!: (response: Response) => void;
    harness.fetch.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    await readAutomatically();
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
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
  it("clears already read text after a failed later page", async () => {
    await loadedList(); openedModal();
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [{ id: "u1", role: "user", text: "PRIVATE_QUESTION" }], nextCursor: "next" }));
    await readAutomatically();
    harness.fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    click(button(modal(), "继续读取后续对话")); await settle();
    const html = renderToStaticMarkup(modal());
    expect(html).not.toContain("PRIVATE_QUESTION");
    expect(html).toContain("若权限已变化");
  });
  it("allows a failed direct read to be retried without asking for a reason", async () => {
    await loadedList(); openedModal();
    harness.fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await readAutomatically();
    expect(renderToStaticMarkup(modal())).toContain("重试读取对话");
    harness.fetch.mockResolvedValueOnce(Response.json({ messages: [{ id: "retry", role: "assistant", text: "RETRIED_ANSWER" }], nextCursor: null }));
    click(button(modal(), "重试读取对话")); await settle();
    expect(renderToStaticMarkup(modal())).toContain("RETRIED_ANSWER");
    expect(JSON.parse(harness.fetch.mock.calls[2][1].body)).toEqual({ id: row.id });
  });
  it("returns focus without changing the table scroll when the window closes", async () => {
    await loadedList();
    const scroll = { scrollTop: 280 };
    harness.refs.list[1].current = scroll;
    const tree = openedModal();
    const header = nodes(tree, node => node.type === ConversationHeader)[0];
    (header.props.onClose as () => void)();
    cleanup.pop()!();
    expect(scroll.scrollTop).toBe(280);
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(nodes(list(), node => typeof node.type === "function" && node.type.name === "ConversationWindow")).toHaveLength(0);
  });
  it("closes the read window when the page becomes hidden", async () => {
    await loadedList(); openedModal(); await readAutomatically();
    documentEvents.visibilityState = "hidden";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    expect(nodes(list(), node => typeof node.type === "function" && node.type.name === "ConversationWindow")).toHaveLength(0);
  });
  it.each(["pagehide", "pageshow"])("discards selected content on %s", async event => {
    await loadedList(); openedModal();
    const transition = new Event(event);
    Object.defineProperty(transition, "persisted", { value: true });
    page.dispatchEvent(transition);
    expect(nodes(list(), node => typeof node.type === "function" && node.type.name === "ConversationWindow")).toHaveLength(0);
  });
  it("ignores ordinary initial pageshow without clearing a verified list or reading twice", async () => {
    await loadedList();
    page.dispatchEvent(new Event("pageshow"));
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(list())).toContain(row.id);
  });
  it("coalesces initial Strict Mode setup into one list read", async () => {
    list();
    const effect = harness.effects[0];
    const firstCleanup = effect();
    if (firstCleanup) firstCleanup();
    const dispose = effect();
    if (dispose) cleanup.push(dispose);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
  it("clears identity fields immediately and merges restore events before revealing freshly verified rows", async () => {
    harness.fetch.mockResolvedValueOnce(Response.json({ rows: [{ ...row, identity: { employeeNo: "OLD_NUMBER", account: null, organization: "OLD_ORG", source: "current-profile" } }], nextCursor: null }));
    await loadedList();
    expect(renderToStaticMarkup(list())).toContain("OLD_NUMBER");
    documentEvents.visibilityState = "hidden";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    expect(renderToStaticMarkup(list())).not.toContain("OLD_");
    let resolve!: (response: Response) => void;
    harness.fetch.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    documentEvents.visibilityState = "visible";
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    page.dispatchEvent(restored);
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(2);
    expect(renderToStaticMarkup(list())).not.toContain("OLD_");
    resolve(Response.json({ rows: [{ ...row, identity: { employeeNo: "NEW_NUMBER", account: null, organization: "NEW_ORG", source: "current-profile" } }], nextCursor: null }));
    await settle();
    expect(renderToStaticMarkup(list())).toContain("NEW_NUMBER");
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledTimes(2);
  });
  it("aborts an in-flight identity list on pagehide and rejects its late result", async () => {
    let resolve!: (response: Response) => void;
    harness.fetch.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    list();
    for (const effect of harness.effects) { const dispose = effect(); if (dispose) cleanup.push(dispose); }
    await vi.advanceTimersByTimeAsync(0);
    const signal = harness.fetch.mock.calls[0][1].signal as AbortSignal;
    page.dispatchEvent(new Event("pagehide"));
    expect(signal.aborted).toBe(true);
    resolve(Response.json({ rows: [{ ...row, identity: { employeeNo: "LATE_NUMBER", account: null, organization: "LATE_ORG", source: "current-profile" } }], nextCursor: null }));
    await settle();
    expect(renderToStaticMarkup(list())).not.toContain("LATE_");
  });
  it("clears old identity rows after a denied page read and retries that exact target page", async () => {
    harness.fetch.mockResolvedValueOnce(Response.json({ rows: [{ ...row, identity: { employeeNo: "OLD_NUMBER", account: null, organization: "OLD_ORG", source: "current-profile" } }], nextCursor: "second-page-cursor" }));
    await loadedList();
    harness.fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    click(button(list(), "下一页")); await settle();
    expect(renderToStaticMarkup(list())).not.toContain("OLD_");
    expect(renderToStaticMarkup(list())).toContain("重试读取");
    harness.fetch.mockResolvedValueOnce(Response.json({ rows: [{ ...row, id: "page-two-verified" }], nextCursor: null }));
    click(button(list(), "重试读取")); await settle();
    expect(harness.fetch.mock.calls[2][0]).toContain("cursor=second-page-cursor");
    expect(renderToStaticMarkup(list())).toContain("第 2 页");
    expect(renderToStaticMarkup(list())).toContain("page-two-verified");
  });
  it("removes records and closes the window at session expiry", async () => {
    await loadedList(); openedModal();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(text(list())).toContain("登录已失效");
    expect(text(list())).not.toContain(row.id);
  });
});

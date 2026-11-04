import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { BoardNotificationResult, SuggestionDetail } from "@/modules/feedback/board-types";

const hooks = vi.hoisted(() => ({ slot: 0, refSlot: 0, dirty: false, states: [] as unknown[], refs: [] as Array<{ current: unknown }>, cleanups: [] as Array<() => void> }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const slot = hooks.slot++;
    if (!(slot in hooks.states)) hooks.states[slot] = typeof initial === "function" ? initial() : initial;
    return [hooks.states[slot], (next: unknown) => { hooks.states[slot] = typeof next === "function" ? next(hooks.states[slot]) : next; hooks.dirty = true; }];
  },
  useEffect: (setup: () => (() => void) | void) => { const cleanup = setup(); if (cleanup) hooks.cleanups.push(cleanup); },
  useRef: (initial: unknown) => hooks.refs[hooks.refSlot++] ??= { current: initial },
}));
vi.mock("./board-client", async (original) => ({ ...await original<typeof import("./board-client")>(), useBoardResource: vi.fn(), boardRequest: vi.fn(), markBoardNotificationsRead: vi.fn() }));
import { FeedbackBoard, SuggestionFeedCard, ComposerDialog, PublishSuggestion } from "./FeedbackBoard";
import { ManageSuggestion } from "./SuggestionDetailView";
import { BoardRequestError, boardRequest, markBoardNotificationsRead, useBoardResource } from "./board-client";
import { BoardError, BoardSelect } from "./board-ui";
import { LhButton, LhTextArea } from "@/components/ui/lighthouse-primitives";

const viewer = { userId: "employee", displayName: "员工", csrfToken: "csrf", canManage: true };
const initial: SuggestionDetail = {
  id: "idea", title: "建议", content: "内容", category: "platform", status: "pending", author: { id: "author", name: "作者" },
  createdAt: "2026-11-04T01:00:00Z", updatedAt: "2026-11-04T01:00:00Z", likeCount: 0, commentCount: 0, likedByMe: false,
  excerpt: "内容摘要", latestResponse: null, comments: [], nextCommentCursor: null, events: [], relatedSuggestion: null,
};
function render(component: () => ReactNode): ReactNode {
  let tree: ReactNode;
  let attempts = 0;
  do { hooks.slot = 0; hooks.refSlot = 0; hooks.dirty = false; tree = component(); if (++attempts > 10) throw new Error("unstable render"); } while (hooks.dirty);
  return tree;
}
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, type));
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode; action?: ReactNode }>;
  return [...(element.type === type ? [element as ReactElement<Record<string, unknown>>] : []), ...find(element.props.children, type), ...find(element.props.action, type)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as ReactElement<{ children?: ReactNode }>).props.children);
}
function button(tree: ReactNode, label: string) { return find(tree, LhButton).find((item) => text(item.props.children as ReactNode) === label)!; }
function change(element: ReactElement<Record<string, unknown>>, value: string) { (element.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } }); }
function click(element: ReactElement<Record<string, unknown>>) { return (element.props.onClick as () => void)(); }
function submit(tree: ReactNode) { return (find(tree, "form")[0].props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault: vi.fn() }); }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
beforeEach(() => {
  vi.clearAllMocks(); hooks.states = []; hooks.refs = []; hooks.cleanups = [];
  vi.mocked(useBoardResource).mockReturnValue({ data: { items: [], total: 0, page: 1, pageSize: 20 }, loading: false, error: undefined, reload: vi.fn(), update: vi.fn() });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("manager conflict review", () => {
  it("refreshes every controlled field after 409, preserves the note and requires review before the winner's revision can be submitted", async () => {
    let item = initial;
    const updated = vi.fn();
    const component = () => ManageSuggestion({ item, viewer, disabled: false, onUpdated: updated, onRefresh: vi.fn() });
    let tree = render(component);
    change(find(tree, BoardSelect).find((entry) => entry.props.label === "处理状态")!, "accepted");
    change(find(tree, BoardSelect).find((entry) => entry.props.label === "建议分类")!, "other");
    change(find(tree, LhTextArea)[0], "保留我的回应草稿");
    vi.mocked(boardRequest).mockRejectedValueOnce(new BoardRequestError("其他管理员已更新", 409));
    await submit(render(component));
    expect(button(render(component), "保存回应").props.disabled).toBe(true);
    item = { ...initial, status: "in_progress", category: "culture", updatedAt: "2026-11-04T02:00:00Z", relatedSuggestion: { id: "winning-related", title: "管理员最新关联" } };
    tree = render(component);
    expect(find(tree, BoardSelect).map((entry) => entry.props.value)).toEqual(["in_progress", "culture", "winning-related"]);
    expect(find(tree, LhTextArea)[0].props.value).toBe("保留我的回应草稿");
    expect(button(tree, "保存回应").props.disabled).toBe(true);
    await submit(tree);
    expect(boardRequest).toHaveBeenCalledTimes(1);
    click(button(render(component), "已核对最新信息"));
    vi.mocked(boardRequest).mockResolvedValueOnce({ ...item, updatedAt: "2026-11-04T03:00:00Z" });
    await submit(render(component));
    expect(boardRequest).toHaveBeenLastCalledWith("/api/feedback/idea", expect.objectContaining({ body: { status: "in_progress", category: "culture", relatedSuggestionId: "winning-related", note: "保留我的回应草稿", expectedUpdatedAt: "2026-11-04T02:00:00Z" } }), viewer.userId);
  });

  it("does not carry a note or old fields into another suggestion with the same timestamp", () => {
    let item = initial;
    const component = () => ManageSuggestion({ item, viewer, disabled: false, onUpdated: vi.fn(), onRefresh: vi.fn() });
    change(find(render(component), LhTextArea)[0], "旧建议草稿");
    item = { ...initial, id: "another-idea", status: "implemented", category: "knowledge" };
    const tree = render(component);
    expect(find(tree, LhTextArea)[0].props.value).toBe("");
    expect(find(tree, BoardSelect).map((entry) => entry.props.value)).toEqual(["implemented", "knowledge", ""]);
    expect(button(tree, "已核对最新信息")).toBeUndefined();
  });

  it("does not treat the manager's own successful save as an external revision needing review", async () => {
    let item = initial;
    const component = () => ManageSuggestion({ item, viewer, disabled: false, onUpdated: (next) => { item = next; }, onRefresh: vi.fn() });
    change(find(render(component), LhTextArea)[0], "正式回应");
    vi.mocked(boardRequest).mockResolvedValueOnce({ ...initial, status: "reviewing", updatedAt: "2026-11-04T04:00:00Z" });
    await submit(render(component));
    const tree = render(component);
    expect(find(tree, LhTextArea)[0].props.value).toBe("");
    expect(button(tree, "已核对最新信息")).toBeUndefined();
    expect(button(tree, "保存回应").props.disabled).toBe(false);
  });
});

describe("loaded notification actions", () => {
  function setupNotifications(count: number) {
    let data: BoardNotificationResult = { items: Array.from({ length: count }, (_, index) => ({ id: `n-${index}`, suggestionId: "idea", title: "建议回应", message: "有新回应", createdAt: initial.createdAt, readAt: null })), unreadCount: count, nextCursor: "first-page-cursor" };
    const reload = vi.fn();
    const update = vi.fn((next: unknown) => { data = typeof next === "function" ? (next as (current: BoardNotificationResult) => BoardNotificationResult)(data) : next as BoardNotificationResult; });
    vi.mocked(useBoardResource).mockImplementation((url) => url.includes("notifications") ? { data, loading: false, error: undefined, reload, update } : { data: { items: [], total: 0, page: 1, pageSize: 20 }, loading: false, error: undefined, reload: vi.fn(), update: vi.fn() });
    return { get data() { return data; }, reload };
  }

  it("updates only the completed notification batch and leaves the rest unread on partial failure", async () => {
    const notifications = setupNotifications(121);
    const component = () => FeedbackBoard({ viewer });
    click(find(render(component), LhButton).find((entry) => text(entry.props.children as ReactNode).startsWith("我的通知"))!);
    vi.mocked(markBoardNotificationsRead).mockImplementationOnce(async (ids, _token, _owner, onBatch) => { onBatch(ids.slice(0, 50)); throw new Error("第二批失败，请重试"); });
    click(button(render(component), "将已加载通知标为已读"));
    await flush();
    expect(notifications.data.items.filter((entry) => entry.readAt)).toHaveLength(50);
    expect(notifications.data.unreadCount).toBe(71);
    expect(find(render(component), BoardError)[0].props.message).toBe("第二批失败，请重试");
    expect(find(render(component), LhButton).filter((entry) => text(entry.props.children as ReactNode) === "标为已读")).toHaveLength(71);
  });

  it("uses the refreshed first page cursor after loading more and then refreshing notifications", async () => {
    const notifications = setupNotifications(1);
    const component = () => FeedbackBoard({ viewer });
    click(find(render(component), LhButton).find((entry) => text(entry.props.children as ReactNode).startsWith("我的通知"))!);
    vi.mocked(boardRequest).mockResolvedValueOnce({ items: [], unreadCount: 1, nextCursor: "old-second-page-cursor" });
    click(button(render(component), "更多通知")); await flush();
    expect(notifications.data.nextCursor).toBe("old-second-page-cursor");
    notifications.reload.mockImplementation(() => { notifications.data.nextCursor = "refreshed-first-page-cursor"; });
    click(find(render(component), LhButton).find((entry) => text(entry.props.children as ReactNode).startsWith("我的通知"))!);
    vi.mocked(boardRequest).mockResolvedValueOnce({ items: [], unreadCount: 1, nextCursor: null });
    click(button(render(component), "更多通知")); await flush();
    expect(boardRequest).toHaveBeenLastCalledWith("/api/feedback/notifications?cursor=refreshed-first-page-cursor", undefined, viewer.userId);
    expect(button(render(component), "更多通知")).toBeUndefined();
  });
});


describe("community feed participation and likes", () => {
  function setupFeed() {
    let data = { items: [initial], total: 1, page: 1, pageSize: 20 };
    const reload = vi.fn();
    const update = vi.fn((next: unknown) => { data = typeof next === "function" ? (next as (current: typeof data) => typeof data)(data) : next as typeof data; });
    vi.mocked(useBoardResource).mockImplementation((url) => url.includes("notifications") ? { data: { items: [], unreadCount: 0, nextCursor: null }, loading: false, error: undefined, reload: vi.fn(), update: vi.fn() } : { data, loading: false, error: undefined, reload, update });
    return { reload, update };
  }
  const nativeButton = (tree: ReactNode, label: string) => find(tree, "button").find((item) => text(item.props.children as ReactNode) === label)!;

  it("uses participated for the personal view and preserves category filtering", () => {
    setupFeed();
    const component = () => FeedbackBoard({ viewer });
    click(nativeButton(render(component), "我参与的"));
    click(nativeButton(render(component), "服务文化"));
    render(component);
    const url = vi.mocked(useBoardResource).mock.calls.filter(([url]) => !url.includes("notifications")).at(-1)![0];
    expect(new URL(url, "https://example.invalid").searchParams.get("participated")).toBe("true");
    expect(new URL(url, "https://example.invalid").searchParams.get("category")).toBe("culture");
    expect(new URL(url, "https://example.invalid").searchParams.get("mine")).toBeNull();
  });

  it("deduplicates immediate likes, uses the server count and refreshes participation/order", async () => {
    const feed = setupFeed();
    const component = () => FeedbackBoard({ viewer });
    let resolve!: (value: unknown) => void;
    vi.mocked(boardRequest).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const action = find(render(component), SuggestionFeedCard)[0].props.onLike as () => void;
    action(); action();
    expect(boardRequest).toHaveBeenCalledTimes(1);
    expect(find(render(component), SuggestionFeedCard)[0].props.busy).toBe(true);
    resolve({ liked: true, likeCount: 9 }); await flush();
    expect(find(render(component), SuggestionFeedCard)[0].props.item).toMatchObject({ likedByMe: true, likeCount: 9 });
    expect(feed.reload).toHaveBeenCalledTimes(1);
    expect(boardRequest).toHaveBeenCalledWith("/api/feedback/idea/like", expect.objectContaining({ body: { liked: true }, csrfToken: "csrf" }), "employee");
  });

  it("refreshes the latest feed after switching views and returning without applying the old snapshot", async () => {
    const feed = setupFeed();
    const component = () => FeedbackBoard({ viewer });
    let resolve!: (value: unknown) => void;
    vi.mocked(boardRequest).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    (find(render(component), SuggestionFeedCard)[0].props.onLike as () => void)();
    click(nativeButton(render(component), "热门")); render(component);
    click(nativeButton(render(component), "最新"));
    const reloadLatest = vi.fn();
    const previousResource = vi.mocked(useBoardResource).getMockImplementation()!;
    vi.mocked(useBoardResource).mockImplementation((url, owner) => ({ ...previousResource(url, owner), reload: reloadLatest }));
    render(component);
    resolve({ liked: true, likeCount: 90 }); await flush();
    expect(feed.update).not.toHaveBeenCalled();
    expect(feed.reload).not.toHaveBeenCalled();
    expect(reloadLatest).toHaveBeenCalledTimes(1);
    const newestRequest = vi.mocked(useBoardResource).mock.calls.filter(([url]) => !url.includes("notifications")).at(-1)![0];
    expect(new URL(newestRequest, "https://example.invalid").searchParams.get("sort")).toBe("latest");
  });

  it("does not refresh after the feed has unmounted", async () => {
    const feed = setupFeed();
    const component = () => FeedbackBoard({ viewer });
    let resolve!: (value: unknown) => void;
    vi.mocked(boardRequest).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    (find(render(component), SuggestionFeedCard)[0].props.onLike as () => void)();
    for (const cleanup of hooks.cleanups) cleanup();
    resolve({ liked: true, likeCount: 9 }); await flush();
    expect(feed.reload).not.toHaveBeenCalled();
    expect(feed.update).not.toHaveBeenCalled();
  });

  it("does not refresh a different employee's feed", async () => {
    const feed = setupFeed();
    let owner = viewer;
    const component = () => FeedbackBoard({ viewer: owner });
    let resolve!: (value: unknown) => void;
    vi.mocked(boardRequest).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    (find(render(component), SuggestionFeedCard)[0].props.onLike as () => void)();
    owner = { ...viewer, userId: "other-employee" }; render(component);
    resolve({ liked: true, likeCount: 9 }); await flush();
    expect(feed.reload).not.toHaveBeenCalled();
    expect(feed.update).not.toHaveBeenCalled();
  });

  it("keeps failed likes unchanged, exposes retry guidance and unlocks the action", async () => {
    setupFeed();
    const component = () => FeedbackBoard({ viewer });
    vi.mocked(boardRequest).mockRejectedValueOnce(new Error("网络断开，请重试"));
    (find(render(component), SuggestionFeedCard)[0].props.onLike as () => void)(); await flush();
    const card = find(render(component), SuggestionFeedCard)[0];
    expect(card.props.error).toBe("网络断开，请重试");
    expect(card.props.busy).toBe(false);
    expect(card.props.item).toMatchObject({ likedByMe: false, likeCount: 0 });
  });

  it("opens a named composer without placing its fields in the feed", () => {
    setupFeed();
    const component = () => FeedbackBoard({ viewer });
    expect(find(render(component), ComposerDialog)).toHaveLength(0);
    const entry = find(render(component), LhButton).find((item) => item.props["aria-haspopup"] === "dialog")!;
    click(entry);
    expect(find(render(component), ComposerDialog)).toHaveLength(1);
    expect(find(render(component), PublishSuggestion)).toHaveLength(0);
  });
});


describe("native composer focus lifecycle", () => {
  it("focuses the title after opening, and closes the modal before restoring trigger focus", () => {
    const order: string[] = [];
    const onCancel = vi.fn(() => order.push("restore-trigger"));
    const component = () => ComposerDialog({ viewer, onCancel, onPublished: vi.fn() });
    render(component);
    hooks.refs[0].current = { showModal: () => order.push("show-modal"), close: () => order.push("close-modal"), querySelector: vi.fn((selector: string) => { expect(selector).toBe("#suggestion-title"); return { focus: () => order.push("focus-title") }; }) };
    const tree = render(component);
    expect(order).toEqual(["show-modal", "focus-title"]);
    expect(find(tree, "dialog")[0].props["aria-labelledby"]).toBe("publish-heading");
    (find(tree, "dialog")[0].props.onCancel as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
    expect(order.slice(-2)).toEqual(["close-modal", "restore-trigger"]);
  });

  it("closes the modal before the published callback restores the trigger", () => {
    const order: string[] = [];
    const component = () => ComposerDialog({ viewer, onCancel: vi.fn(), onPublished: () => order.push("published-restore-trigger") });
    render(component);
    hooks.refs[0].current = { showModal: vi.fn(), close: () => order.push("close-modal"), querySelector: () => null };
    const tree = render(component);
    (find(tree, PublishSuggestion)[0].props.onPublished as (item: SuggestionDetail) => void)(initial);
    expect(order).toEqual(["close-modal", "published-restore-trigger"]);
  });
});

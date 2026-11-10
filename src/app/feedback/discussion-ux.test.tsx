import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { LhBackLink, LhButton, LhEmptyState, LhTextArea } from "@/components/ui/lighthouse-primitives";
import type { SuggestionComment, SuggestionDetail } from "@/modules/feedback/board-types";
import { boardRequest, useBoardResource } from "./board-client";
import { BoardError } from "./board-ui";
import { SuggestionDetailView } from "./SuggestionDetailView";

const hooks = vi.hoisted(() => ({
  state: 0, ref: 0, effect: 0,
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  effects: [] as { deps: readonly unknown[]; cleanup?: () => void }[],
  commit: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const slot = hooks.state++;
    if (!(slot in hooks.states)) hooks.states[slot] = initial;
    return [hooks.states[slot], (value: unknown) => { hooks.states[slot] = value; }];
  },
  useRef: (initial: unknown) => hooks.refs[hooks.ref++] ??= { current: initial },
  useEffect: (setup: () => (() => void) | void, deps: readonly unknown[]) => {
    const slot = hooks.effect++;
    const previous = hooks.effects[slot];
    if (previous && deps.every((value, index) => Object.is(value, previous.deps[index]))) return;
    hooks.commit.push(() => {
      previous?.cleanup?.();
      hooks.effects[slot] = { deps, cleanup: setup() || undefined };
    });
  },
}));
vi.mock("./board-client", () => ({ useBoardResource: vi.fn(), boardRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({
  returnTo: "/feedback?view=popular&category=platform&page=2", returnAnchor: "resource-idea",
}) }));

const viewer = { userId: "employee", displayName: "员工", csrfToken: "csrf", canManage: false };
const existing: SuggestionComment = {
  id: "existing", author: { id: "author", name: "员工甲" }, content: "已有评论", createdAt: "2026-11-04T01:00:00Z",
  replyToId: null, replyToAuthorName: null, hidden: false,
};
const detail: SuggestionDetail = {
  id: "idea", title: "建议", content: "建议正文", category: "platform", status: "pending", author: existing.author,
  createdAt: existing.createdAt, updatedAt: existing.createdAt, likeCount: 0, commentCount: 1, likedByMe: false,
  excerpt: "建议正文", latestResponse: null, comments: [existing], nextCommentCursor: null, events: [], relatedSuggestion: null,
};

type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
function find(node: ReactNode, type: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, type));
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  const element = node as Element;
  return [...(element.type === type ? [element] : []), ...find(element.props.children, type)];
}
function button(tree: ReactNode, label: string) {
  return find(tree, LhButton).find(({ props }) => [props.children].flat().join("") === label)!;
}
function click(element: Element) { (element.props.onClick as () => void)(); }
function submit(tree: ReactNode) {
  return (find(tree, "form")[0].props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault: vi.fn() });
}

function setup(initial?: SuggestionDetail) {
  let data = initial;
  const browser = Object.assign(new EventTarget(), { location: { hash: "" } });
  const elements = new Map<string, ReturnType<typeof target>>();
  const dom = { body: {}, documentElement: {}, activeElement: {}, getElementById: (id: string) => elements.get(id) };
  dom.activeElement = dom.body;
  function target() {
    const element = { scrollIntoView: vi.fn(), focus: vi.fn(() => { dom.activeElement = element; }) };
    return element;
  }
  const heading = target();
  const discussion = target();
  const textarea = target();
  const newComment = target();
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", dom);
  vi.mocked(useBoardResource).mockImplementation(() => ({
    data, loading: !data, error: undefined, reload: vi.fn(),
    update: (next: unknown) => { data = next as SuggestionDetail; },
  }));

  function render() {
    hooks.state = hooks.ref = hooks.effect = 0;
    for (const ref of hooks.refs) ref.current = null;
    const tree = SuggestionDetailView({ id: "idea", viewer });
    const headingRef = find(tree, "h2").find(({ props }) => props.id === "discussion-title")?.props.ref as { current: unknown } | undefined;
    const textareaRef = find(tree, LhTextArea)[0]?.props.ref as { current: unknown } | undefined;
    if (headingRef) { headingRef.current = heading; elements.set("discussion", discussion); }
    if (textareaRef) textareaRef.current = textarea;
    if (find(tree, "li").some(({ props }) => props.id === "comment-new" && props.tabIndex === -1)) elements.set("comment-new", newComment);
    for (const effect of hooks.commit.splice(0)) effect();
    return tree;
  }
  return { browser, dom, heading, discussion, textarea, newComment, render, load: (next: SuggestionDetail) => { data = next; } };
}

beforeEach(() => { vi.resetAllMocks(); hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.commit = []; });
afterEach(() => { hooks.effects.forEach(({ cleanup }) => cleanup?.()); vi.unstubAllGlobals(); });

describe("suggestion discussion navigation and composer", () => {
  it("waits for the discussion to commit, handles later hash changes and preserves active comment focus", () => {
    const ui = setup();
    ui.browser.location.hash = "#discussion";
    const loading = ui.render();
    expect(find(loading, LhBackLink)[0].props).toMatchObject({ href: "/feedback?sort=popular&category=platform&page=2#resource-idea", scroll: false });
    expect(ui.discussion.scrollIntoView).not.toHaveBeenCalled();

    ui.load(detail);
    let tree = ui.render();
    expect(ui.discussion.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(ui.heading.focus).toHaveBeenCalledTimes(1);
    expect(find(tree, "li")).toHaveLength(1);
    expect(find(tree, LhTextArea)).toHaveLength(0);

    click(button(tree, "回复 员工甲"));
    tree = ui.render();
    expect(find(tree, LhTextArea)[0].props.label).toBe("回复 员工甲");
    expect(ui.dom.activeElement).toBe(ui.textarea);
    expect(ui.discussion.scrollIntoView).toHaveBeenCalledTimes(1);

    ui.browser.location.hash = "#unrelated";
    ui.browser.dispatchEvent(new Event("hashchange"));
    ui.browser.location.hash = "#discussion";
    ui.browser.dispatchEvent(new Event("hashchange"));
    expect(ui.discussion.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(ui.dom.activeElement).toBe(ui.textarea);
    expect(ui.heading.focus).toHaveBeenCalledTimes(1);
  });

  it("opens the empty discussion on demand, preserves a collapsed draft and moves to the posted comment", async () => {
    const ui = setup({ ...detail, comments: [], commentCount: 0 });
    let tree = ui.render();
    expect(find(tree, LhEmptyState)[0].props.title).toBe("还没有评论");
    expect(button(tree, "写评论").props["aria-expanded"]).toBe(false);
    click(button(tree, "写评论"));
    tree = ui.render();
    expect(ui.dom.activeElement).toBe(ui.textarea);
    (find(tree, LhTextArea)[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "我的草稿" } });
    click(button(tree, "收起"));
    tree = ui.render();
    expect(find(tree, LhTextArea)).toHaveLength(0);
    click(button(tree, "写评论"));
    tree = ui.render();
    expect(find(tree, LhTextArea)[0].props.value).toBe("我的草稿");

    vi.mocked(boardRequest).mockRejectedValueOnce(new Error("发送失败，请重试"));
    const failed = submit(tree);
    expect(button(ui.render(), "发送中…").props.disabled).toBe(true);
    await failed;
    tree = ui.render();
    expect(find(tree, BoardError)[0].props.message).toBe("发送失败，请重试");
    expect(find(tree, LhTextArea)[0].props.value).toBe("我的草稿");

    vi.mocked(boardRequest).mockResolvedValueOnce({ ...existing, id: "new", content: "我的草稿" });
    await submit(tree);
    tree = ui.render();
    expect(find(tree, LhTextArea)).toHaveLength(0);
    expect(ui.newComment.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(ui.dom.activeElement).toBe(ui.newComment);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { UIMessage } from "ai";

const harness = vi.hoisted(() => ({
  slot: 0, states: [] as unknown[], refs: [] as Array<{ current: unknown }>, refSlot: 0,
  messages: [] as UIMessage[], status: "ready", options: {} as Record<string, (value: never) => void>,
  send: vi.fn(), regenerate: vi.fn(), stop: vi.fn(), clearError: vi.fn(), attachments: [] as Array<{ id: string; localId: string; name: string; size: number; status: "ready"; sent?: boolean }>,
  effects: [] as Array<{ run: () => void | (() => void); dependencies: unknown[] }>, fetch: vi.fn(),
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const slot = harness.slot++;
    if (!(slot in harness.states)) harness.states[slot] = typeof initial === "function" ? initial() : initial;
    return [harness.states[slot], (next: unknown) => { harness.states[slot] = typeof next === "function" ? next(harness.states[slot]) : next; }];
  },
  useRef: (initial: unknown) => { const slot = harness.refSlot++; return harness.refs[slot] ??= { current: initial }; },
  useMemo: (factory: () => unknown) => factory(), useEffect: (run: () => void | (() => void), dependencies: unknown[] = []) => { harness.effects.push({ run, dependencies }); },
  useLayoutEffect: vi.fn(),
}));
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: harness.fetch }));
vi.mock("@ai-sdk/react", () => ({ useChat: (options: typeof harness.options) => {
  harness.options = options;
  return { messages: harness.messages, setMessages: (update: (messages: UIMessage[]) => UIMessage[]) => { harness.messages = update(harness.messages); }, status: harness.status,
    sendMessage: harness.send, regenerate: harness.regenerate, stop: harness.stop, clearError: harness.clearError };
} }));
vi.mock("./useHermitAttachments", () => ({ useHermitAttachments: () => ({ attachments: harness.attachments, setAttachments: (update: (files: typeof harness.attachments) => typeof harness.attachments) => { harness.attachments = update(harness.attachments); }, uploadError: null, isUploadingAttachments: false,
  handleFilesSelected: vi.fn(), handleRemoveAttachment: (file: { id: string }) => { harness.attachments = harness.attachments.filter(item => item.id !== file.id); }, handleRetryAttachment: vi.fn(), uploadScopeRef: { current: { active: true } } }) }));
import { ConversationWorkspace } from "./ChatPanel";
import { ChatInput } from "./ChatInput";
import { RunFeedback } from "./RunFeedback";
import { ScenarioCards } from "./ScenarioCards";
import { MessageBubble } from "./MessageBubble";
import type { HermitDocumentRecommendation } from "./types";
import type { ContextRemoval } from "./message-context";
import { MessageContext } from "./MessageContext";
import type { ConversationDetail } from "./conversation-state";
import { MIRROR_CASE_ID, type CaseDraftReference, type HermitCaseEntry } from "./case-entry";
import { HermitDraftStore } from "./draft-store";
import { LhChatInputShell, LhChatSubmitButton } from "@/components/ui/lighthouse-primitives";

function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(child => find(child, type));
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [...(element.type === type ? [element as ReactElement<Record<string, unknown>>] : []), ...find(element.props.children, type)];
}
let incomingEntry: HermitCaseEntry | undefined;
let incomingDraft = "";
let incomingReference: CaseDraftReference | null = null;
let draftStore: HermitDraftStore | undefined;
const consumeEntry = vi.fn();
function render(initial?: ConversationDetail) {
  harness.slot = 0; harness.refSlot = 0;
  harness.effects = [];
  return ConversationWorkspace({ id: "saved-session", owner: "employee:a", initial, entry: incomingEntry, draftText: incomingDraft, onEntryConsumed: consumeEntry,
    restoredCaseReference: incomingReference, onCaseReferenceChange: reference => draftStore?.setCaseReference("saved-session", reference),
    onDraftChange: text => { draftStore?.write("saved-session", text); draftStore?.select("saved-session", false); },
    onNew: vi.fn(), onHistory: vi.fn(), onSaved: vi.fn() });
}
function composer() { return find(render(), ChatInput)[0].props as unknown as { value: string; onChange: (text: string) => void; onSubmit: () => void;
  onSelectDocument: (document: HermitDocumentRecommendation) => void; onSelectSkill: (skill: HermitDocumentRecommendation) => void;
  documentContext: HermitDocumentRecommendation | null; skillContext: HermitDocumentRecommendation | null; attachments: typeof harness.attachments;
  onClearDocumentContext: () => void; isResolvingContext: boolean; submitBlockedReason?: string }; }
const documentA = { id: "doc:a", resourceId: "a", versionId: "v1", title: "文档 A", source: "中台" };
const documentB = { id: "doc:b", resourceId: "b", versionId: "v2", title: "文档 B", source: "中台" };
const skill = { id: "skill:s", resourceId: "s", versionId: "s1", title: "方法", source: "中台" };
beforeEach(() => {
  incomingEntry = undefined; incomingDraft = ""; incomingReference = null; draftStore = undefined;
  vi.clearAllMocks(); harness.slot = 0; harness.refSlot = 0; harness.states = []; harness.refs = []; harness.messages = []; harness.status = "ready"; harness.attachments = [];
  harness.send.mockImplementation(async ({ text, metadata }) => { harness.messages.push({ id: `user-${harness.messages.length}`, role: "user", parts: [{ type: "text", text }], metadata }); }); harness.regenerate.mockResolvedValue(undefined);
});

const caseReference = { resourceId: MIRROR_CASE_ID, versionId: "case-published" };
const casePublication = { id: MIRROR_CASE_ID, title: "镜鉴案例", source: "灯塔", version: { id: "case-published", markdown: "案例正文", publishedAt: "2026-10-28T00:00:00Z" } };
async function settle() { for (let index = 0; index < 8; index++) await Promise.resolve(); }
function runReferenceEffect() { return harness.effects.find(effect => effect.dependencies.length === 1 && typeof effect.dependencies[0] === "number")!.run(); }

describe("case intake draft lifecycle", () => {
  it("restores an accepted case reference after URL consumption and a fresh component mount", async () => {
    const values = new Map<string, string>();
    const memory = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    draftStore = new HermitDraftStore("employee:a", memory); draftStore.activate();
    incomingEntry = { title: "镜鉴案例", prompt: "请结合案例分析现场", document: { id: "case", ...caseReference, title: "镜鉴案例", source: "灯塔" } };
    render();
    harness.effects.find(effect => effect.dependencies.length === 4)!.run();
    expect(consumeEntry).toHaveBeenCalledOnce();
    expect(draftStore.caseReference("saved-session")).toEqual(caseReference);
    draftStore.dispose();

    draftStore = new HermitDraftStore("employee:a", memory); draftStore.activate();
    incomingEntry = undefined; incomingDraft = draftStore.text("saved-session"); incomingReference = draftStore.caseReference("saved-session");
    harness.states = []; harness.refs = [];
    harness.fetch.mockResolvedValue(Response.json(casePublication));
    expect(composer()).toMatchObject({ value: "请结合案例分析现场", documentContext: null, isResolvingContext: true });
    composer().onSubmit(); expect(harness.send).not.toHaveBeenCalled();
    const cleanup = runReferenceEffect();
    await settle();
    expect(composer()).toMatchObject({ isResolvingContext: false, documentContext: { ...caseReference, title: "镜鉴案例", source: "灯塔" } });
    composer().onSubmit();
    expect(harness.send).toHaveBeenCalledWith(expect.anything(), { body: { attachmentIds: [], documentContext: caseReference } });
    expect(new HermitDraftStore("employee:a", memory).caseReference("saved-session")).toBeNull();
    cleanup?.();
  });

  it("makes recovery failure actionable, retries, and prevents late restoration after removal", async () => {
    incomingDraft = "保留的草稿"; incomingReference = caseReference;
    harness.fetch.mockResolvedValueOnce(Response.json({ error: "forbidden" }, { status: 403 }));
    render(); let cleanup = runReferenceEffect(); await settle();
    expect(composer().submitBlockedReason).toContain("案例引用未恢复");
    composer().onSubmit(); expect(harness.send).not.toHaveBeenCalled();
    const retry = find(render(), "button").find(button => button.props.children === "重试恢复引用")!;
    (retry.props.onClick as () => void)(); cleanup?.();
    let release!: (value: Response) => void;
    harness.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
    render(); cleanup = runReferenceEffect();
    const remove = find(render(), "button").find(button => button.props.children === "移除引用，继续编辑")!;
    (remove.props.onClick as () => void)();
    release(Response.json(casePublication)); await settle();
    expect(composer()).toMatchObject({ value: "保留的草稿", documentContext: null, isResolvingContext: false, submitBlockedReason: undefined });
    composer().onSubmit();
    expect(harness.send).toHaveBeenCalledWith(expect.anything(), { body: { attachmentIds: [] } });
    cleanup?.();
  });

  it("disables only sending while reference recovery is pending or failed", () => {
    const props = { value: "可以继续编辑", onChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn(), isLoading: false, isUploading: false,
      attachments: [], onFilesSelected: vi.fn(), onRemoveAttachment: vi.fn(), onRetryAttachment: vi.fn(), onClearDocumentContext: vi.fn() };
    for (const state of [{ isResolvingContext: true }, { submitBlockedReason: "请重试或移除引用" }]) {
      const view = ChatInput({ ...props, ...state });
      expect(find(view, LhChatSubmitButton)[0].props.disabled).toBe(true);
      (find(view, LhChatInputShell)[0].props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });
      expect(props.onSubmit).not.toHaveBeenCalled();
    }
  });
});
describe("Hermit workspace handlers", () => {
  it("fills a case question and readable document in an empty composer without sending", () => {
    incomingEntry = { prompt: "请结合案例分析现场", title: "案例 A", document: documentA };
    expect(composer()).toMatchObject({ value: incomingEntry.prompt, documentContext: documentA });
    expect(harness.send).not.toHaveBeenCalled();
    composer().onChange("我补充了现场情况"); composer().onSubmit();
    expect(harness.send).toHaveBeenCalledWith(expect.objectContaining({ text: "我补充了现场情况" }), { body: { attachmentIds: [], documentContext: { resourceId: "a", versionId: "v1" } } });
  });
  it("keeps an existing draft until the case question is explicitly added", () => {
    incomingDraft = "原现场描述";
    incomingEntry = { prompt: "镜鉴案例问题", title: "案例 A", document: documentA };
    expect(composer()).toMatchObject({ value: incomingDraft, documentContext: null });
    const apply = find(render(), "button").find(button => button.props.children === "将案例问题加入草稿");
    (apply?.props.onClick as () => void)();
    expect(composer()).toMatchObject({ value: "原现场描述\n\n镜鉴案例问题", documentContext: documentA });
    expect(consumeEntry).toHaveBeenCalledOnce(); expect(harness.send).not.toHaveBeenCalled();
  });
  it("binds useChat to the selected history ID and only fills the draft when a scenario is clicked", () => {
    const view = render();
    (find(view, ScenarioCards)[0].props.onSelect as (draft: string) => void)("可编辑的场景草稿");
    expect(composer().value).toBe("可编辑的场景草稿");
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.options.id).toBe("saved-session");
  });
  it("anchors errors at the answer and retries without sending another user turn or overwriting the next draft", async () => {
    composer().onChange("第一问"); composer().onSubmit();
    expect(harness.send).toHaveBeenCalledWith(expect.objectContaining({ text: "第一问" }), { body: { attachmentIds: [] } });
    harness.messages = [{ id: "user-1", role: "user", parts: [{ type: "text", text: "第一问" }] }];
    composer().onChange("还没发出的下一句");
    harness.options.onError(new Error("network unavailable") as never);
    expect(harness.messages.filter(message => message.role === "user")).toHaveLength(1);
    const feedback = find(render(), RunFeedback).find(element => element.props.error);
    (feedback?.props.onRetry as () => void)();
    await Promise.resolve();
    expect(harness.regenerate).toHaveBeenCalledExactlyOnceWith({ body: { attachmentIds: [] } });
    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(composer().value).toBe("还没发出的下一句");
  });
  it("moves sent materials to their user turn, preserves follow-up context and isolates the next draft from retry", async () => {
    harness.attachments = [{ id: "file-a", localId: "file-a", name: "记录.txt", size: 8, status: "ready" }];
    composer().onSelectDocument(documentA); composer().onSelectSkill(skill);
    composer().onChange("分析 A"); composer().onSubmit();
    await Promise.resolve();
    expect(composer()).toMatchObject({ value: "", attachments: [], documentContext: null, skillContext: null });
    expect(harness.messages[0].metadata).toMatchObject({ hermitContext: { attachments: [{ id: "file-a", name: "记录.txt", size: 8 }], documentContext: documentA, skillContext: skill } });
    composer().onSelectDocument(documentB); composer().onChange("下一条草稿");
    harness.options.onError(new Error("network") as never);
    (find(render(), RunFeedback).find(element => element.props.onRetry)?.props.onRetry as () => void)();
    expect(harness.regenerate).toHaveBeenLastCalledWith({ body: { attachmentIds: ["file-a"], documentContext: { resourceId: "a", versionId: "v1" }, skillContext: { resourceId: "s", versionId: "s1" } } });
    expect(composer()).toMatchObject({ value: "下一条草稿", documentContext: documentB });
    composer().onSubmit(); await Promise.resolve();
    const users = harness.messages.filter(message => message.role === "user");
    expect(users[0].metadata).toMatchObject({ hermitContext: { documentContext: documentA } });
    expect(users[1].metadata).toMatchObject({ hermitContext: { documentContext: documentB, attachments: [{ id: "file-a" }], skillContext: skill } });
    expect(composer().documentContext).toBeNull();
  });
  it("removing a sent reference affects later requests without erasing the user message snapshot", async () => {
    harness.attachments = [{ id: "file-a", localId: "file-a", name: "记录.txt", size: 8, status: "ready" }];
    composer().onSelectDocument(documentA); composer().onSelectSkill(skill); composer().onChange("分析"); composer().onSubmit();
    await Promise.resolve();
    const remove = (item: ContextRemoval) => (find(render(), MessageBubble)[0].props.onRemoveContext as (item: ContextRemoval) => void)(item);
    remove({ kind: "document", resourceId: "a", versionId: "v1" }); remove({ kind: "skill", resourceId: "s", versionId: "s1" }); remove({ kind: "attachment", id: "file-a" });
    harness.options.onError(new Error("network") as never);
    (find(render(), RunFeedback).find(element => element.props.onRetry)?.props.onRetry as () => void)();
    expect(harness.regenerate).toHaveBeenLastCalledWith({ body: { attachmentIds: [] } });
    expect(harness.messages[0].metadata).toMatchObject({ hermitContext: { attachments: [{ id: "file-a" }], documentContext: documentA, skillContext: skill } });
    composer().onChange("下一问"); composer().onSubmit(); await Promise.resolve();
    expect(harness.send).toHaveBeenLastCalledWith(expect.objectContaining({ text: "下一问" }), { body: { attachmentIds: [] } });
  });
  it("shows restored active materials separately if a legacy retry used different materials from the user snapshot", () => {
    harness.messages = [
      { id: "u", role: "user", parts: [{ type: "text", text: "原问题" }], metadata: { hermitContext: { attachments: [], documentContext: documentA } } },
      { id: "a", role: "assistant", parts: [], metadata: { hermitStatus: "failed" } },
    ];
    const view = render({ id: "saved-session", title: "历史", messages: harness.messages, attachments: [], unavailableAttachments: [], documentContext: documentB, skillContext: null, unavailableSkillContext: null });
    expect(find(view, ChatInput)[0].props.documentContext).toBeNull();
    expect(find(view, MessageContext)[0].props.context).toMatchObject({ documentContext: documentB });
    (find(view, RunFeedback).find(element => element.props.onRetry)?.props.onRetry as () => void)();
    expect(harness.regenerate).toHaveBeenLastCalledWith({ body: { attachmentIds: [], documentContext: { resourceId: "b", versionId: "v2" } } });
  });
  it("accepts the next draft while streaming but refuses another send, then stops explicitly", () => {
    harness.status = "streaming";
    harness.messages = [{ id: "u", role: "user", parts: [{ type: "text", text: "第一问" }] }];
    composer().onChange("下一句"); composer().onSubmit();
    expect(composer().value).toBe("下一句"); expect(harness.send).not.toHaveBeenCalled();
    (find(render(), ChatInput)[0].props.onStop as () => void)();
    expect(harness.stop).toHaveBeenCalledOnce();
    harness.status = "ready";
    expect(find(render(), RunFeedback).some(element => element.props.cancelled)).toBe(true);
  });
});

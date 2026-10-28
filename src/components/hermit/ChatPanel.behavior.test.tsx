import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { UIMessage } from "ai";

const harness = vi.hoisted(() => ({
  slot: 0, states: [] as unknown[], refs: [] as Array<{ current: unknown }>, refSlot: 0,
  messages: [] as UIMessage[], status: "ready", options: {} as Record<string, (value: never) => void>,
  send: vi.fn(), regenerate: vi.fn(), stop: vi.fn(), clearError: vi.fn(), attachments: [] as Array<{ id: string; localId: string; name: string; size: number; status: "ready" }>,
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const slot = harness.slot++;
    if (!(slot in harness.states)) harness.states[slot] = typeof initial === "function" ? initial() : initial;
    return [harness.states[slot], (next: unknown) => { harness.states[slot] = typeof next === "function" ? next(harness.states[slot]) : next; }];
  },
  useRef: (initial: unknown) => { const slot = harness.refSlot++; return harness.refs[slot] ??= { current: initial }; },
  useMemo: (factory: () => unknown) => factory(), useEffect: vi.fn(),
}));
vi.mock("@ai-sdk/react", () => ({ useChat: (options: typeof harness.options) => {
  harness.options = options;
  return { messages: harness.messages, setMessages: (update: (messages: UIMessage[]) => UIMessage[]) => { harness.messages = update(harness.messages); }, status: harness.status,
    sendMessage: harness.send, regenerate: harness.regenerate, stop: harness.stop, clearError: harness.clearError };
} }));
vi.mock("./useHermitAttachments", () => ({ useHermitAttachments: () => ({ attachments: harness.attachments, setAttachments: vi.fn(), uploadError: null, isUploadingAttachments: false,
  handleFilesSelected: vi.fn(), handleRemoveAttachment: vi.fn(), handleRetryAttachment: vi.fn(), uploadScopeRef: { current: { active: true } } }) }));
import { ConversationWorkspace } from "./ChatPanel";
import { ChatInput } from "./ChatInput";
import { RunFeedback } from "./RunFeedback";
import { ScenarioCards } from "./ScenarioCards";

function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(child => find(child, type));
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [...(element.type === type ? [element as ReactElement<Record<string, unknown>>] : []), ...find(element.props.children, type)];
}
function render() {
  harness.slot = 0; harness.refSlot = 0;
  return ConversationWorkspace({ id: "saved-session", owner: "employee:a", onNew: vi.fn(), onHistory: vi.fn(), onSaved: vi.fn() });
}
function composer() { return find(render(), ChatInput)[0].props as unknown as { value: string; onChange: (text: string) => void; onSubmit: () => void }; }
beforeEach(() => {
  vi.clearAllMocks(); harness.slot = 0; harness.refSlot = 0; harness.states = []; harness.refs = []; harness.messages = []; harness.status = "ready"; harness.attachments = [];
  harness.send.mockResolvedValue(undefined); harness.regenerate.mockResolvedValue(undefined);
});
describe("Hermit workspace handlers", () => {
  it("binds useChat to the selected history ID and only fills the draft when a scenario is clicked", () => {
    const view = render();
    (find(view, ScenarioCards)[0].props.onSelect as (draft: string) => void)("可编辑的场景草稿");
    expect(composer().value).toBe("可编辑的场景草稿");
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.options.id).toBe("saved-session");
  });
  it("anchors errors at the answer and retries without sending another user turn or overwriting the next draft", async () => {
    composer().onChange("第一问"); composer().onSubmit();
    expect(harness.send).toHaveBeenCalledWith({ text: "第一问" }, { body: { attachmentIds: [] } });
    harness.messages = [{ id: "user-1", role: "user", parts: [{ type: "text", text: "第一问" }] }];
    composer().onChange("还没发出的下一句");
    harness.options.onError(new Error("network unavailable") as never);
    expect(harness.messages.filter(message => message.role === "user")).toHaveLength(1);
    const feedback = find(render(), RunFeedback).find(element => element.props.error);
    (feedback?.props.onRetry as () => void)();
    await Promise.resolve();
    expect(harness.regenerate).toHaveBeenCalledExactlyOnceWith({ body: { attachmentIds: [], documentContext: undefined } });
    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(composer().value).toBe("还没发出的下一句");
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

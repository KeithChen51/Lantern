import { describe, expect, it } from "vitest";
import { ConversationReadScope, markTerminalState, messageRunState, restoredAttachments, restoredContext, type ConversationDetail } from "./conversation-state";
import type { UIMessage } from "ai";

describe("Hermit conversation boundaries", () => {
  it("rejects late reads after another conversation starts or identity unmounts, even if fetch ignores abort", () => {
    const scope = new ConversationReadScope();
    const first = scope.begin();
    expect(first.current()).toBe(true);
    const next = scope.begin();
    expect(first.signal.aborted).toBe(true);
    expect(first.current()).toBe(false);
    expect(next.current()).toBe(true);
    scope.dispose();
    expect(next.current()).toBe(false);
    expect(next.signal.aborted).toBe(true);
  });
  it("excludes expired attachment IDs from restored context without losing document version", () => {
    const detail: ConversationDetail = { id: "saved", title: "test", messages: [], attachments: [{ id: "expired", name: "old.txt", size: 10 }, { id: "ready", name: "new.txt", size: 20 }], unavailableAttachments: [{ id: "expired", name: "old.txt" }], documentContext: { resourceId: "resource", versionId: "version", title: "知识", source: "本心" }, skillContext: null, unavailableSkillContext: null };
    expect(restoredAttachments(detail)).toEqual([{ id: "ready", localId: "restored:ready", name: "new.txt", size: 20, status: "ready", sent: true }]);
    expect(restoredContext(detail)).toMatchObject({ resourceId: "resource", versionId: "version", title: "知识" });
  });
  it("anchors failure to an assistant slot, preserves partial text, and never duplicates the user", () => {
    const user: UIMessage = { id: "question", role: "user", parts: [{ type: "text", text: "问题" }] };
    const failed = markTerminalState([user], "failed");
    expect(failed.filter(item => item.role === "user")).toEqual([user]);
    expect(messageRunState(failed[1])).toBe("failed");
    expect(markTerminalState(failed, "cancelled")).toHaveLength(2);
    const partial: UIMessage = { id: "answer", role: "assistant", parts: [{ type: "text", text: "已经生成" }], metadata: { existing: true } };
    expect(markTerminalState([user, partial], "cancelled")[1]).toEqual({ ...partial, metadata: { existing: true, hermitStatus: "cancelled" } });
  });
});

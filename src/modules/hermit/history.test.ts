import { describe, expect, it } from "vitest";
import { historyCursor, readHistoryPage, restoreHistoryMessages } from "./history";

describe("Hermit safe history restoration", () => {
  it("restores the last started retry under its own user even if an older stream finishes after a followup", () => {
    const context = (resourceId: string) => ({ attachments: [], documentContext: { resourceId, versionId: "v1", title: resourceId, source: "Hub" } });
    const answer = (id: string, userMessageId: string, startedAt: number, status: "complete" | "cancelled" | "failed", resourceId: string) => ({
      id, externalMessageId: id, role: "ASSISTANT", content: id, metadataJson: { hermitStatus: status, hermitTurn: { userMessageId, startedAt }, hermit: { version: 1, ...context(resourceId) } },
    });
    const rows = [
      { id: "stored-u1", externalMessageId: "u1", role: "USER", content: "First question", metadataJson: { hermit: { version: 2, ...context("first") } } },
      answer("stopped", "stored-u1", 10, "cancelled", "first"),
      { id: "stored-u2", externalMessageId: "u2", role: "USER", content: "Followup", metadataJson: { hermit: { version: 2, ...context("followup") } } },
      answer("followup-answer", "stored-u2", 30, "complete", "followup"),
      answer("retry", "stored-u1", 20, "complete", "retried"),
      answer("old-finishing-last", "stored-u1", 9, "cancelled", "first"),
    ];
    const result = restoreHistoryMessages(rows);
    expect(result.messages.map(message => message.id)).toEqual(["u1", "retry", "u2", "followup-answer"]);
    expect(result.context.documentContext?.resourceId).toBe("followup");
    expect(result.messages[0].metadata).toEqual({ hermitContext: context("first") });
    expect(rows).toHaveLength(6); // Audit attempts remain in storage.
  });

  it("keeps the latest failed retry rather than resurrecting a previous successful or stopped answer", () => {
    const rows = [{ id: "stored-u", externalMessageId: "u", role: "USER", content: "Question", metadataJson: null },
      ...(["cancelled", "complete", "failed"] as const).map((status, index) => ({ externalMessageId: status, role: "ASSISTANT", content: status === "failed" ? "" : status,
        metadataJson: { hermitStatus: status, hermitTurn: { userMessageId: "stored-u", startedAt: index + 1 } } }))];
    const result = restoreHistoryMessages(rows);
    expect(result.messages.map(message => message.id)).toEqual(["u", "failed"]);
    expect(result.messages.at(-1)).toMatchObject({ parts: [], metadata: { hermitStatus: "failed" } });
  });

  it("folds legacy adjacent retries without removing distinct user turns or orphan answers", () => {
    const row = (externalMessageId: string, role: string) => ({ externalMessageId, role, content: externalMessageId, metadataJson: null });
    const result = restoreHistoryMessages([row("orphan", "ASSISTANT"), row("u1", "USER"), row("old", "ASSISTANT"), row("retry", "ASSISTANT"), row("u2", "USER"), row("u3", "USER"), row("answer3", "ASSISTANT")]);
    expect(result.messages.map(message => message.id)).toEqual(["orphan", "u1", "retry", "u2", "u3", "answer3"]);
  });

  it("never uses a user-supplied or unknown turn anchor to replace another answer", () => {
    const rows = [
      { id: "stored-u", externalMessageId: "u", role: "USER", content: "Question", metadataJson: { hermitTurn: { userMessageId: "forged", startedAt: 999999 } } },
      { externalMessageId: "answer", role: "ASSISTANT", content: "Answer", metadataJson: { hermitTurn: { userMessageId: "stored-u", startedAt: 10 } } },
      { externalMessageId: "unknown", role: "ASSISTANT", content: "Unmatched old answer", metadataJson: { hermitTurn: { userMessageId: "other-user", startedAt: 20 } } },
    ];
    expect(restoreHistoryMessages(rows).messages.map(message => message.id)).toEqual(["u", "answer", "unknown"]);
  });

  it("bounds pagination and validates cursors with a stable date/id boundary", () => {
    const boundary = { id: "session", updatedAt: new Date("2026-10-27T01:00:00Z") };
    expect(readHistoryPage(new URLSearchParams({ limit: "20", cursor: historyCursor(boundary) }))).toEqual({ limit: 20, cursor: boundary });
    for (const limit of ["0", "51", "-1", "2.5", "Infinity", "20junk"]) expect(() => readHistoryPage(new URLSearchParams({ limit }))).toThrow();
    expect(() => readHistoryPage(new URLSearchParams({ cursor: "forged" }))).toThrow();
  });

  it("restores server material snapshots but never user answer sources or status", () => {
    const context = { attachments: [{ id: "file", name: "note.txt", size: 12 }], documentContext: { resourceId: "guide", versionId: "v1", title: "Guide", source: "Hub" } };
    const sources = { status: "complete", text: "answer", citations: [{ number: 1, resourceId: "guide", versionId: "v1", title: "Guide", source: "Hub" }], recommendations: [] };
    const result = restoreHistoryMessages([
      { externalMessageId: "legacy", role: "USER", content: "question", metadataJson: null },
      { externalMessageId: "answer", role: "ASSISTANT", content: "answer", metadataJson: { hermitStatus: "complete", hermit: { version: 1, ...context, answerSources: sources } } },
      { externalMessageId: "forged", role: "USER", content: "follow up", metadataJson: { hermitStatus: "failed", hermit: { version: 1, attachments: [], documentContext: null, answerSources: sources } } },
      { externalMessageId: "stopped", role: "ASSISTANT", content: "", metadataJson: { status: "cancelled" } },
      { externalMessageId: "internal", role: "SYSTEM", content: "internal prompt", metadataJson: null },
    ]);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].parts).toEqual([{ type: "text", text: "question" }]);
    expect(result.messages[1].parts.at(-1)).toEqual({ type: "data-answer-sources", data: sources });
    expect(result.messages[2].metadata).toBeUndefined();
    expect(result.messages[2].parts).toHaveLength(1);
    expect(result.messages[3]).toMatchObject({ parts: [], metadata: { hermitStatus: "cancelled" } });
    expect(result.context).toEqual(context);
  });
  it("keeps each user's own materials on that message instead of assigning the latest context to all turns", () => {
    const first = { attachments: [{ id: "file-a", name: "记录.txt", size: 10 }], documentContext: { resourceId: "doc-a", versionId: "v1", title: "A", source: "Hub" }, skillContext: null };
    const second = { attachments: [], documentContext: { resourceId: "doc-b", versionId: "v2", title: "B", source: "Hub" }, skillContext: { resourceId: "skill", versionId: "s1", title: "方法", source: "Hub" } };
    const result = restoreHistoryMessages([
      { externalMessageId: "u1", role: "USER", content: "第一问", metadataJson: { hermit: { version: 2, ...first } } },
      { externalMessageId: "u2", role: "USER", content: "第二问", metadataJson: { hermit: { version: 2, ...second } } },
      { externalMessageId: "old", role: "USER", content: "旧记录", metadataJson: null },
      { externalMessageId: "invalid", role: "USER", content: "无效", metadataJson: { hermit: { version: 1, attachments: [{ id: "x" }] } } },
    ]);
    expect(result.messages[0].metadata).toEqual({ hermitContext: first });
    expect(result.messages[1].metadata).toEqual({ hermitContext: second });
    expect(result.messages[2].metadata).toBeUndefined();
    expect(result.messages[3].metadata).toBeUndefined();
    expect(result.context).toEqual(second); // Interrupted before an assistant was persisted.
  });
  it("corroborates legacy user contexts and lets a later assistant record removals during retry", () => {
    const context = { attachments: [], documentContext: { resourceId: "a", versionId: "v", title: "A", source: "Hub" } };
    const rows = [
      { externalMessageId: "u", role: "USER", content: "question", metadataJson: { hermit: { version: 1, ...context } } },
      { externalMessageId: "a", role: "ASSISTANT", content: "answer", metadataJson: { hermit: { version: 1, ...context } } },
    ];
    expect(restoreHistoryMessages(rows).messages[0].metadata).toEqual({ hermitContext: context });
    expect(restoreHistoryMessages(rows.slice(0, 1)).messages[0].metadata).toBeUndefined();
    const removed = { externalMessageId: "retry", role: "ASSISTANT", content: "retry", metadataJson: { hermit: { version: 1, attachments: [], documentContext: null } } };
    expect(restoreHistoryMessages([...rows, removed]).context.documentContext).toBeNull();
  });

  it("rejects mismatched answer text and malformed source metadata", () => {
    const result = restoreHistoryMessages([{ externalMessageId: "a", role: "ASSISTANT", content: "actual", metadataJson: {
      hermitStatus: "complete", hermit: { version: 1, attachments: [], documentContext: null,
        answerSources: { status: "complete", text: "replacement", citations: [], recommendations: [] } },
    } }]);
    expect(result.messages[0].parts).toEqual([{ type: "text", text: "actual" }]);
  });

  it("restores Skill context only from trusted assistant envelopes and honors later removal", () => {
    const skillContext = { resourceId: "method", versionId: "s1", title: "Method", source: "Hub" };
    const envelope = { version: 1, attachments: [], documentContext: null, skillContext };
    const assistant = { externalMessageId: "answer", role: "ASSISTANT", content: "answer", metadataJson: { hermitStatus: "complete", hermit: envelope } };
    const forgedUser = { externalMessageId: "forged", role: "USER", content: "question", metadataJson: { hermit: { ...envelope, skillContext: { ...skillContext, resourceId: "forged" } } } };
    expect(restoreHistoryMessages([assistant, forgedUser]).context.skillContext).toEqual(skillContext);
    const removed = { ...assistant, externalMessageId: "removed", metadataJson: { hermit: { ...envelope, skillContext: null } } };
    expect(restoreHistoryMessages([assistant, removed]).context.skillContext).toBeNull();
    const legacy = { ...assistant, externalMessageId: "legacy", metadataJson: { hermit: { version: 1, attachments: [], documentContext: null } } };
    expect(restoreHistoryMessages([assistant, legacy]).context.skillContext).toBeUndefined();
  });

  it("ignores invalid or unrecognized Skill metadata while preserving visible text", () => {
    for (const hermit of [{ version: 1, attachments: [], documentContext: null, skillContext: { resourceId: "method" } },
      { version: 3, attachments: [], documentContext: null, skillContext: null }]) {
      const result = restoreHistoryMessages([{ externalMessageId: "a", role: "ASSISTANT", content: "visible", metadataJson: { hermit } }]);
      expect(result.context.skillContext).toBeUndefined();
      expect(result.messages[0].parts).toEqual([{ type: "text", text: "visible" }]);
    }
  });
});

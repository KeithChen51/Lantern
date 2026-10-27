import { describe, expect, it } from "vitest";
import { historyCursor, readHistoryPage, restoreHistoryMessages } from "./history";

describe("Hermit safe history restoration", () => {
  it("bounds pagination and validates cursors with a stable date/id boundary", () => {
    const boundary = { id: "session", updatedAt: new Date("2026-10-27T01:00:00Z") };
    expect(readHistoryPage(new URLSearchParams({ limit: "20", cursor: historyCursor(boundary) }))).toEqual({ limit: 20, cursor: boundary });
    for (const limit of ["0", "51", "-1", "2.5", "Infinity", "20junk"]) expect(() => readHistoryPage(new URLSearchParams({ limit }))).toThrow();
    expect(() => readHistoryPage(new URLSearchParams({ cursor: "forged" }))).toThrow();
  });

  it("restores legacy text, server answer sources and interrupted empty messages without trusting user metadata", () => {
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

  it("rejects mismatched answer text and malformed source metadata", () => {
    const result = restoreHistoryMessages([{ externalMessageId: "a", role: "ASSISTANT", content: "actual", metadataJson: {
      hermitStatus: "complete", hermit: { version: 1, attachments: [], documentContext: null,
        answerSources: { status: "complete", text: "replacement", citations: [], recommendations: [] } },
    } }]);
    expect(result.messages[0].parts).toEqual([{ type: "text", text: "actual" }]);
  });
});

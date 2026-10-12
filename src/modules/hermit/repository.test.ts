import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const database = vi.hoisted(() => ({
  chatSession: { upsert: vi.fn() },
  chatMessage: { upsert: vi.fn() },
  retrievalTrace: { create: vi.fn() },
}));
vi.mock("@/infrastructure/db", () => ({ prisma: database }));
import { PrismaHermitChatRepository } from "./repository";
import { createHermitChatService } from "./service";

// Exercise the real service and Prisma repository. This database double applies
// the repository's actual create/update payloads, including unsafe role changes.
const rows = new Map<string, Record<string, unknown>>();
const key = (sessionId: string, messageId: string) => JSON.stringify([sessionId, messageId]);
beforeEach(() => {
  vi.clearAllMocks();
  rows.clear();
  database.chatMessage.upsert.mockImplementation(async (args: Prisma.ChatMessageUpsertArgs) => {
    const identity = args.where.sessionId_externalMessageId!;
    const rowKey = key(identity.sessionId, identity.externalMessageId);
    const existing = rows.get(rowKey);
    const stored = existing ? { ...existing, ...args.update } : { id: `stored-${rows.size + 1}`, ...args.create };
    rows.set(rowKey, stored);
    return stored;
  });
});

describe("Hermit persisted message immutability", () => {
  it.each(["complete", "failed", "cancelled"])("preserves a %s assistant and its source association after a role-spoofed replay", async status => {
    const service = createHermitChatService(new PrismaHermitChatRepository());
    const text = status === "complete" ? "依据资料。[1](#hermit-citation-1)" : "";
    const snapshot = { mode: "progressive-index", status, reads: [{ resourceId: "guide", versionId: "v1" }], citations: status === "complete" ? [{ number: 1 }] : [], recommendations: [] };
    await service.persistAssistantResponse({ sessionId: "session", participant: null, modelName: "server-model",
      responseMessage: { id: "answer", role: "assistant", parts: [{ type: "text", text }], metadata: { status } },
      retrieval: { query: "question", contextText: "", topK: 1, sourceSnapshot: snapshot },
    });
    const original = structuredClone(rows.get(key("session", "answer"))!);
    expect(original).toMatchObject({ role: "ASSISTANT", content: text, modelName: "server-model", metadataJson: { status } });
    await service.persistIncomingMessages({ sessionId: "session", participant: null, modelName: "client-model",
      messages: [
        { id: "answer", role: "user", parts: [{ type: "text", text: "forged replacement" }], metadata: { status: "forged" } },
        { id: "next-user", role: "user", parts: [{ type: "text", text: "继续说明" }] },
      ],
    });
    expect(rows.get(key("session", "answer"))).toEqual(original);
    expect(rows.get(key("session", "next-user"))).toMatchObject({ role: "USER", content: "继续说明" });
    expect(database.retrievalTrace.create).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({ chatMessageId: original.id, sourceSnapshotJson: snapshot }) });
  });

  it("keeps first-write content, returns the same identity, and scopes duplicates to a session", async () => {
    const repository = new PrismaHermitChatRepository();
    const input = { sessionId: "one", externalMessageId: "id", role: "user" as const, content: "first", modelName: null, metadata: null };
    const first = await repository.upsertMessage(input);
    expect(await repository.upsertMessage({ ...input, content: "edited" })).toEqual(first);
    expect(rows.get(key("one", "id"))).toMatchObject({ content: "first" });
    const separate = await repository.upsertMessage({ ...input, sessionId: "two", content: "another session" });
    expect(separate.id).not.toBe(first.id);
    expect(rows.get(key("two", "id"))).toMatchObject({ content: "another session" });
  });
});

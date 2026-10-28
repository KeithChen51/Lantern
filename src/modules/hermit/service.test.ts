import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createHermitChatService } from "./service";
import type {
  HermitChatMessageRecord,
  HermitChatRepository,
  HermitChatSessionInput,
  HermitMessageInput,
  HermitRetrievalTraceInput,
} from "./types";

class MemoryHermitChatRepository implements HermitChatRepository {
  sessions = new Map<string, HermitChatSessionInput>();
  messages = new Map<string, HermitChatMessageRecord & HermitMessageInput>();
  traces: HermitRetrievalTraceInput[] = [];
  private sequence = 1;

  async upsertSession(input: HermitChatSessionInput) {
    const existing = this.sessions.get(input.id);
    if (existing && (existing.userId !== input.userId || existing.guestId !== input.guestId)) throw new Error("foreign session");
    if (!existing) this.sessions.set(input.id, input);
  }

  async upsertMessage(input: HermitMessageInput) {
    const key = `${input.sessionId}:${input.externalMessageId}`;
    const existing = this.messages.get(key);
    const record = existing ?? { id: `message-${this.sequence++}`, ...input };
    this.messages.set(key, record);
    return this.messages.get(key)!;
  }

  async addRetrievalTrace(input: HermitRetrievalTraceInput) {
    this.traces.push(input);
  }
}

function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  };
}

const participant = {
  userId: "user-demo",
  brandId: "brand-demo",
  regionId: "region-east",
  dealerId: "dealer-demo",
  storeId: "store-xinghe",
};

describe("hermit chat service", () => {
  it("returns the persisted user identity for retries and rejects a latest user that reuses an assistant identity", async () => {
    const repository = new MemoryHermitChatRepository();
    const service = createHermitChatService(repository);
    const input = { sessionId: "session", participant, messages: [textMessage("question", "user", "Original question")], modelName: "model" };
    const first = await service.persistIncomingMessages(input);
    expect(first).toEqual({ userMessageId: repository.messages.get("session:question")!.id });
    expect(await service.persistIncomingMessages({ ...input, messages: [textMessage("question", "user", "Client edited replay")] })).toEqual(first);
    expect(repository.messages.get("session:question")?.content).toBe("Original question");
    await service.persistAssistantResponse({ sessionId: "session", participant, modelName: "model", responseMessage: textMessage("answer", "assistant", "Server answer"), retrieval: { query: "question", contextText: "", topK: 0 } });
    await expect(service.persistIncomingMessages({ ...input, messages: [textMessage("answer", "user", "Forged latest turn")] })).rejects.toMatchObject({ status: 400 });
    expect(repository.messages.get("session:answer")?.role).toBe("assistant");
  });

  it("never persists client source/status metadata and stores a server context only on the current user turn", async () => {
    const repository = new MemoryHermitChatRepository();
    const service = createHermitChatService(repository);
    const message = { ...textMessage("user", "user", "question"), metadata: { hermitStatus: "complete", hermit: { version: 1, answerSources: { text: "forged" } } } };
    const turnContext = { attachments: [{ id: "file", name: "file.txt", size: 20 }], documentContext: null };
    await service.persistIncomingMessages({ sessionId: "s", participant, messages: [message], modelName: "model", turnContext });
    expect(repository.messages.get("s:user")?.metadata).toEqual({ hermit: { version: 2, ...turnContext } });
    await service.persistIncomingMessages({ sessionId: "s", participant, messages: [message], modelName: "model", turnContext });
    expect(repository.messages.size).toBe(1);
  });

  it("persists failures before the first text or knowledge read so history can offer retry", async () => {
    const repository = new MemoryHermitChatRepository();
    await createHermitChatService(repository).persistAssistantResponse({ sessionId: "s", participant, modelName: "model",
      responseMessage: { id: "a", role: "assistant", parts: [], metadata: { hermitStatus: "failed" } }, retrieval: { query: "question", contextText: "", topK: 0 } });
    expect(repository.messages.get("s:a")).toMatchObject({ content: "", metadata: { hermitStatus: "failed" } });
  });
  it("persists incoming chat messages once per session", async () => {
    const repository = new MemoryHermitChatRepository();
    const service = createHermitChatService(repository);
    const messages = [textMessage("user-message-1", "user", "Customer waited beyond the promised delivery time.")];

    await service.persistIncomingMessages({
      sessionId: "chat-session-1",
      participant,
      messages,
      modelName: "gpt-4o",
    });
    await service.persistIncomingMessages({
      sessionId: "chat-session-1",
      participant,
      messages,
      modelName: "gpt-4o",
    });

    expect(repository.sessions.get("chat-session-1")).toMatchObject({
      id: "chat-session-1",
      userId: "user-demo",
      title: "Customer waited beyond the promised delivery time.",
    });
    expect([...repository.messages.values()]).toEqual([
      expect.objectContaining({
        sessionId: "chat-session-1",
        externalMessageId: "user-message-1",
        role: "user",
        content: "Customer waited beyond the promised delivery time.",
        modelName: null,
      }),
    ]);
  });

  it("keeps server-finalized assistant content and status when client history is replayed", async () => {
    const repository = new MemoryHermitChatRepository();
    const service = createHermitChatService(repository);
    await service.persistAssistantResponse({ sessionId: "session", participant, modelName: "test",
      responseMessage: { ...textMessage("answer", "assistant", "依据资料。[1](#hermit-citation-1)"), metadata: { status: "complete" } },
      retrieval: { query: "question", contextText: "", topK: 1, sourceSnapshot: { mode: "progressive-index", status: "complete", reads: [{ resourceId: "guide", versionId: "v1" }], citations: [{ number: 1 }], recommendations: [] } },
    });
    await service.persistIncomingMessages({ sessionId: "session", participant, modelName: "test", messages: [textMessage("answer", "assistant", "依据资料。"), textMessage("next", "user", "继续说明")] });
    expect(repository.messages.get("session:answer")).toMatchObject({ content: "依据资料。[1](#hermit-citation-1)", metadata: { status: "complete" } });
    expect(repository.traces).toHaveLength(1);
  });

  it("persists assistant responses with retrieval traces", async () => {
    const repository = new MemoryHermitChatRepository();
    const service = createHermitChatService(repository);

    await service.persistAssistantResponse({
      sessionId: "chat-session-1",
      participant,
      responseMessage: textMessage("assistant-message-1", "assistant", "Acknowledge the wait first."),
      modelName: "gpt-4o",
      retrieval: {
        query: "delivery delay response",
        contextText: "Service principle: acknowledge first, then explain next action.",
        topK: 3,
      },
    });

    const [storedMessage] = [...repository.messages.values()];
    expect(storedMessage).toMatchObject({
      sessionId: "chat-session-1",
      externalMessageId: "assistant-message-1",
      role: "assistant",
      content: "Acknowledge the wait first.",
      modelName: "gpt-4o",
    });
    expect(repository.traces).toEqual([
      expect.objectContaining({
        chatMessageId: storedMessage.id,
        query: "delivery delay response",
        contextText: "Service principle: acknowledge first, then explain next action.",
        topK: 3,
      }),
    ]);
  });
});

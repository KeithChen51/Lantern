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
    this.sessions.set(input.id, { ...this.sessions.get(input.id), ...input });
  }

  async upsertMessage(input: HermitMessageInput) {
    const key = `${input.sessionId}:${input.externalMessageId}`;
    const existing = this.messages.get(key);
    const record = existing ?? { id: `message-${this.sequence++}`, ...input };
    this.messages.set(key, { ...record, ...input });
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

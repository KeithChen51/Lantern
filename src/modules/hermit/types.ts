import type { UIMessage } from "ai";

export type HermitChatParticipant = {
  userId: string;
  brandId: string | null;
  regionId: string | null;
  dealerId: string | null;
  storeId: string | null;
};

export type HermitChatSessionInput = HermitChatParticipant & {
  id: string;
  title: string | null;
};

export type HermitMessageRole = "user" | "assistant" | "system";

export type HermitMessageInput = {
  userId: string;
  sessionId: string;
  externalMessageId: string;
  role: HermitMessageRole;
  content: string;
  modelName: string | null;
  metadata: unknown;
};

export type HermitChatMessageRecord = {
  id: string;
  sessionId: string;
  externalMessageId: string;
};

export type HermitRetrievalTraceInput = {
  userId: string;
  chatMessageId: string;
  query: string;
  contextText: string;
  topK: number;
  sourceSnapshot: unknown;
};

export type PersistIncomingMessagesInput = {
  sessionId: string;
  participant: HermitChatParticipant;
  messages: UIMessage[];
  modelName: string;
};

export type PersistAssistantResponseInput = {
  sessionId: string;
  participant: HermitChatParticipant;
  responseMessage: UIMessage;
  modelName: string;
  retrieval: {
    query: string;
    contextText: string;
    topK: number;
    sourceSnapshot?: unknown;
  };
};

export interface HermitChatRepository {
  /** Atomically creates a new session or checks its immutable employee owner. */
  upsertSession(input: HermitChatSessionInput): Promise<void>;
  /** First write wins for (sessionId, externalMessageId); replay returns the original identity without modifying it. */
  upsertMessage(input: HermitMessageInput): Promise<HermitChatMessageRecord>;
  addRetrievalTrace(input: HermitRetrievalTraceInput): Promise<void>;
}

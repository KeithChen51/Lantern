import type { UIMessage } from "ai";

export type HermitChatParticipant = {
  userId: string | null;
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
  chatMessageId: string;
  query: string;
  contextText: string;
  topK: number;
  sourceSnapshot: unknown;
};

export type PersistIncomingMessagesInput = {
  sessionId: string;
  participant: HermitChatParticipant | null;
  messages: UIMessage[];
  modelName: string;
};

export type PersistAssistantResponseInput = {
  sessionId: string;
  participant: HermitChatParticipant | null;
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
  upsertSession(input: HermitChatSessionInput): Promise<void>;
  upsertMessage(input: HermitMessageInput): Promise<HermitChatMessageRecord>;
  addRetrievalTrace(input: HermitRetrievalTraceInput): Promise<void>;
}

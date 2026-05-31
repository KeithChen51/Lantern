import type { UIMessage } from "ai";
import type {
  HermitChatParticipant,
  HermitChatRepository,
  HermitChatSessionInput,
  HermitMessageInput,
  HermitMessageRole,
  PersistAssistantResponseInput,
  PersistIncomingMessagesInput,
} from "./types";

const MAX_SESSION_TITLE_LENGTH = 80;
const DEFAULT_PARTICIPANT: HermitChatParticipant = {
  userId: null,
  brandId: null,
  regionId: null,
  dealerId: null,
  storeId: null,
};

function isPersistableRole(role: UIMessage["role"]): role is HermitMessageRole {
  return role === "user" || role === "assistant" || role === "system";
}

function extractTextContent(message: UIMessage) {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function buildSessionTitle(messages: UIMessage[]) {
  const firstUserText =
    messages
      .filter((message) => message.role === "user")
      .map(extractTextContent)
      .find((content) => content.length > 0) ?? null;

  if (!firstUserText) return null;
  return firstUserText.length > MAX_SESSION_TITLE_LENGTH
    ? `${firstUserText.slice(0, MAX_SESSION_TITLE_LENGTH - 1)}...`
    : firstUserText;
}

function buildSessionInput(
  sessionId: string,
  participant: HermitChatParticipant | null,
  title: string | null,
): HermitChatSessionInput {
  return {
    ...DEFAULT_PARTICIPANT,
    ...participant,
    id: sessionId,
    title,
  };
}

function toMessageInput(message: UIMessage, sessionId: string, modelName: string): HermitMessageInput | null {
  if (!isPersistableRole(message.role)) return null;

  const content = extractTextContent(message);
  if (!message.id || !content) return null;

  return {
    sessionId,
    externalMessageId: message.id,
    role: message.role,
    content,
    modelName: message.role === "assistant" ? modelName : null,
    metadata: message.metadata ?? null,
  };
}

export class HermitChatService {
  constructor(private readonly repository: HermitChatRepository) {}

  async persistIncomingMessages(input: PersistIncomingMessagesInput) {
    await this.repository.upsertSession(
      buildSessionInput(input.sessionId, input.participant, buildSessionTitle(input.messages)),
    );

    for (const message of input.messages) {
      const messageInput = toMessageInput(message, input.sessionId, input.modelName);
      if (!messageInput) continue;

      await this.repository.upsertMessage(messageInput);
    }
  }

  async persistAssistantResponse(input: PersistAssistantResponseInput) {
    await this.repository.upsertSession(buildSessionInput(input.sessionId, input.participant, null));

    const messageInput = toMessageInput(input.responseMessage, input.sessionId, input.modelName);
    if (!messageInput) return;

    const storedMessage = await this.repository.upsertMessage(messageInput);
    const contextText = input.retrieval.contextText.trim();
    if (!contextText) return;

    await this.repository.addRetrievalTrace({
      chatMessageId: storedMessage.id,
      query: input.retrieval.query,
      contextText,
      topK: input.retrieval.topK,
      sourceSnapshot: input.retrieval.sourceSnapshot ?? null,
    });
  }
}

export function createHermitChatService(repository: HermitChatRepository) {
  return new HermitChatService(repository);
}

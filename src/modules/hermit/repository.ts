import { ChatMessageRole as PrismaChatMessageRole, Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import type {
  HermitChatRepository,
  HermitChatSessionInput,
  HermitMessageInput,
  HermitMessageRole,
  HermitRetrievalTraceInput,
} from "./types";

const roleToPrisma: Record<HermitMessageRole, PrismaChatMessageRole> = {
  user: PrismaChatMessageRole.USER,
  assistant: PrismaChatMessageRole.ASSISTANT,
  system: PrismaChatMessageRole.SYSTEM,
};

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export class PrismaHermitChatRepository implements HermitChatRepository {
  async upsertSession(input: HermitChatSessionInput) {
    const scopeData = {
      userId: input.userId,
      brandId: input.brandId,
      regionId: input.regionId,
      dealerId: input.dealerId,
      storeId: input.storeId,
    };

    await prisma.chatSession.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        ...scopeData,
        title: input.title,
      },
      update: {
        ...scopeData,
        ...(input.title ? { title: input.title } : {}),
      },
    });
  }

  async upsertMessage(input: HermitMessageInput) {
    const data = {
      sessionId: input.sessionId,
      externalMessageId: input.externalMessageId,
      role: roleToPrisma[input.role],
      content: input.content,
      modelName: input.modelName,
      metadataJson: jsonValue(input.metadata),
    };

    const message = await prisma.chatMessage.upsert({
      where: {
        sessionId_externalMessageId: {
          sessionId: input.sessionId,
          externalMessageId: input.externalMessageId,
        },
      },
      create: data,
      update: {
        role: data.role,
        content: data.content,
        modelName: data.modelName,
        metadataJson: data.metadataJson,
      },
    });

    return {
      id: message.id,
      sessionId: message.sessionId,
      externalMessageId: message.externalMessageId,
    };
  }

  async addRetrievalTrace(input: HermitRetrievalTraceInput) {
    await prisma.retrievalTrace.create({
      data: {
        chatMessageId: input.chatMessageId,
        query: input.query,
        contextText: input.contextText,
        topK: input.topK,
        sourceSnapshotJson: jsonValue(input.sourceSnapshot),
      },
    });
  }
}

export const hermitChatRepository = new PrismaHermitChatRepository();

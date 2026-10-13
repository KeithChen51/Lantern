import { ChatMessageRole as PrismaChatMessageRole, Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";
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
    if (!input.userId) throw new AppError("forbidden", "需要有效员工身份。", 403);
    // A single INSERT lets the primary key arbitrate simultaneous claimants.
    // Never update an existing row's owner or adopt an anonymous legacy session.
    try {
      await prisma.chatSession.create({ data: input });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      const session = await prisma.chatSession.findUnique({ where: { id: input.id }, select: { userId: true } });
      if (!session || session.userId !== input.userId) throw new AppError("forbidden", "无法访问该对话。", 403);
    }
  }

  async upsertMessage(input: HermitMessageInput) {
    const session = await prisma.chatSession.findFirst({ where: { id: input.sessionId, userId: input.userId }, select: { id: true } });
    if (!input.userId || !session) throw new AppError("forbidden", "无法访问该对话。", 403);
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
      // Messages have no edit operation. First write owns role, content and
      // audit metadata, even if client history reuses this ID with another role.
      update: {},
    });

    return {
      id: message.id,
      sessionId: message.sessionId,
      externalMessageId: message.externalMessageId,
    };
  }

  async addRetrievalTrace(input: HermitRetrievalTraceInput) {
    const message = await prisma.chatMessage.findFirst({ where: { id: input.chatMessageId, session: { userId: input.userId } }, select: { id: true } });
    if (!input.userId || !message) throw new AppError("forbidden", "无法访问该对话。", 403);
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

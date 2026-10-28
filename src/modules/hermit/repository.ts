import { ChatMessageRole as PrismaChatMessageRole, Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";
import { historyCursor } from "./history";
import type {
  HermitChatRepository,
  HermitChatOwner,
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

function ownerColumns(owner: HermitChatOwner): { userId: string | null; guestId: string | null } {
  const userId = owner.userId ?? null;
  const guestId = owner.guestId ?? null;
  if ((userId !== null && (typeof userId !== "string" || !userId.trim())) ||
      (guestId !== null && (typeof guestId !== "string" || !guestId.trim())) ||
      (userId === null) === (guestId === null)) {
    throw new AppError("forbidden", "需要有效访问身份。", 403);
  }
  return { userId, guestId };
}

export class PrismaHermitChatRepository implements HermitChatRepository {
  async upsertSession(input: HermitChatSessionInput) {
    const owner = ownerColumns(input);
    // A single INSERT lets the primary key arbitrate simultaneous claimants.
    // Never update an existing row's owner or adopt an anonymous legacy session.
    try {
      await prisma.chatSession.create({ data: { ...input, ...owner } });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      const session = await prisma.chatSession.findUnique({ where: { id: input.id }, select: { userId: true, guestId: true } });
      if (!session || session.userId !== owner.userId || session.guestId !== owner.guestId) throw new AppError("forbidden", "无法访问该对话。", 403);
      if (input.title) await prisma.chatSession.updateMany({ where: { id: input.id, ...owner, title: null }, data: { title: input.title } });
    }
  }

  async upsertMessage(input: HermitMessageInput) {
    const owner = ownerColumns(input);
    const session = await prisma.chatSession.findFirst({ where: { id: input.sessionId, ...owner }, select: { id: true } });
    if (!session) throw new AppError("forbidden", "无法访问该对话。", 403);
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
    await prisma.chatSession.updateMany({ where: { id: input.sessionId, ...owner }, data: { updatedAt: new Date() } });

    return {
      id: message.id,
      sessionId: message.sessionId,
      externalMessageId: message.externalMessageId,
    };
  }

  async addRetrievalTrace(input: HermitRetrievalTraceInput) {
    const owner = ownerColumns(input);
    const message = await prisma.chatMessage.findFirst({ where: { id: input.chatMessageId, session: owner }, select: { id: true } });
    if (!message) throw new AppError("forbidden", "无法访问该对话。", 403);
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

  async listConversations(userId: string, page: { limit: number; cursor: { id: string; updatedAt: Date } | null }) {
    const owner = ownerColumns({ userId, guestId: null });
    if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 50) throw new AppError("bad_request", "分页数量无效。", 400);
    const rows = await prisma.chatSession.findMany({
      where: { ...owner, messages: { some: { role: PrismaChatMessageRole.USER } }, ...(page.cursor ? { OR: [
        { updatedAt: { lt: page.cursor.updatedAt } }, { updatedAt: page.cursor.updatedAt, id: { lt: page.cursor.id } },
      ] } : {}) },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: page.limit + 1,
      select: { id: true, title: true, updatedAt: true, messages: { where: { role: { in: [PrismaChatMessageRole.USER, PrismaChatMessageRole.ASSISTANT] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { content: true } } },
    });
    const selected = rows.slice(0, page.limit);
    return { items: selected.map(row => ({ id: row.id, title: row.title || "新的对话", preview: row.messages[0]?.content.slice(0, 160) ?? "", updatedAt: row.updatedAt.toISOString() })),
      nextCursor: rows.length > page.limit ? historyCursor(selected[selected.length - 1]) : null };
  }

  async getConversation(userId: string, id: string) {
    const owner = ownerColumns({ userId, guestId: null });
    const session = await prisma.chatSession.findFirst({ where: { id, ...owner },
      select: { id: true, title: true, messages: { where: { role: { in: [PrismaChatMessageRole.USER, PrismaChatMessageRole.ASSISTANT] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 201,
        select: { externalMessageId: true, role: true, content: true, metadataJson: true } } },
    });
    if (!session) throw new AppError("not_found", "对话不存在或无权访问。", 404);
    if (session.messages.length > 200) throw new AppError("bad_request", "该对话过长，暂无法完整恢复。", 413);
    return session;
  }
}

export const hermitChatRepository = new PrismaHermitChatRepository();

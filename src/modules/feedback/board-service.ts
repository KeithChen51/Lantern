import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { employeeDisplayName } from "@/modules/auth/employee-name";
import { AppError } from "@/shared/errors";
import {
  SUGGESTION_STATUSES, type BoardActor, type BoardAuthor, type BoardNotificationResult,
  type SuggestionComment, type SuggestionCommentInput, type SuggestionCreateInput,
  type SuggestionDetail, type SuggestionListQuery, type SuggestionListResult,
  type SuggestionSummary, type SuggestionUpdateInput,
} from "./board-types";
import {
  readBoardId, readSuggestionComment, readSuggestionCreate, readSuggestionQuery, readSuggestionUpdate,
} from "./board-validation";

const PAGE_SIZE = 20;
const COMMENT_PAGE_SIZE = 50;
const NOTIFICATION_PAGE_SIZE = 50;
const authorSelect = {
  id: true, displayName: true, employeeNo: true,
  identityAccounts: { select: { providerUserId: true } },
} as const;
const commentInclude = {
  author: { select: authorSelect }, replyTo: { select: { author: { select: authorSelect } } },
} satisfies Prisma.FeedbackCommentInclude;
const summaryInclude = (userId: string) => ({
  author: { select: authorSelect },
  _count: { select: { likes: true, comments: true } },
  likes: { where: { userId }, select: { userId: true } },
  events: { include: { actor: { select: authorSelect } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
} satisfies Prisma.FeedbackSuggestionInclude);
type SummaryRow = Prisma.FeedbackSuggestionGetPayload<{ include: ReturnType<typeof summaryInclude> }>;
type CommentRow = Prisma.FeedbackCommentGetPayload<{ include: typeof commentInclude }>;
type Tx = Prisma.TransactionClient;

function author(user: { id: string; displayName: string; employeeNo: string | null;
  identityAccounts: { providerUserId: string }[] }): BoardAuthor {
  const identifiers = [user.employeeNo, ...user.identityAccounts.map((identity) => identity.providerUserId)];
  const account = identifiers.find((value) => value === user.displayName.trim()) ?? "";
  return { id: user.id, name: employeeDisplayName(user.displayName, account) };
}

function excerpt(text: string, limit: number): string {
  return Array.from(text.replace(/\s+/gu, " ").trim()).slice(0, limit).join("");
}

function summary(row: SummaryRow, latest = row.events[0]): SuggestionSummary {
  return {
    id: row.id, title: row.title, category: row.category, status: row.status,
    author: author(row.author), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    likeCount: row._count.likes, commentCount: row._count.comments, likedByMe: row.likes.length > 0,
    excerpt: excerpt(row.content, 180),
    latestResponse: latest ? { note: excerpt(latest.note, 160), actor: author(latest.actor),
      createdAt: latest.createdAt.toISOString() } : null,
  };
}

function commentDto(row: CommentRow): SuggestionComment {
  return {
    id: row.id, author: author(row.author), content: row.hiddenAt ? "" : row.content,
    createdAt: row.createdAt.toISOString(), replyToId: row.replyToId,
    replyToAuthorName: row.replyTo ? author(row.replyTo.author).name : null, hidden: row.hiddenAt !== null,
  };
}

function notFound(): never {
  throw new AppError("not_found", "建议或评论不存在。", 404);
}

function manager(actor: BoardActor) {
  if (!actor.canManage) throw new AppError("forbidden", "仅平台管理员可以处理建议。", 403);
}

/** Employee authentication happens at the HTTP boundary; actor IDs are trusted server identities. */
export class FeedbackBoardService {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async write<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.$transaction(operation, { maxWait: 10_000, timeout: 15_000 });
      } catch (error) {
        // MySQL deadlocks roll back the entire transaction; retry all dependent writes together.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
        if (attempt >= 2) throw new AppError("invalid_transition", "其他操作正在更新建议，请稍后重试。", 409);
      }
    }
  }

  private async lock(tx: Tx, id: string) {
    readBoardId(id);
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM feedback_suggestions WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) notFound();
  }

  async list(actor: BoardActor, query: SuggestionListQuery): Promise<SuggestionListResult> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
    const input = readSuggestionQuery(params);
    const page = input.page ?? 1;
    const where: Prisma.FeedbackSuggestionWhereInput = {
      ...(input.category ? { category: input.category } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.mine ? { authorId: actor.userId } : {}),
      AND: [
        ...(input.q ? [{ OR: [{ title: { contains: input.q } }, { content: { contains: input.q } }] }] : []),
        ...(input.participated ? [{ OR: [{ authorId: actor.userId },
          { likes: { some: { userId: actor.userId } } },
          { comments: { some: { authorId: actor.userId } } }] }] : []),
      ],
    };
    const orderBy: Prisma.FeedbackSuggestionOrderByWithRelationInput[] = input.sort === "popular"
      ? [{ likes: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];
    const [rows, total] = await this.client.$transaction([
      this.client.feedbackSuggestion.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE, include: summaryInclude(actor.userId) }),
      this.client.feedbackSuggestion.count({ where }),
    ]);
    return { items: rows.map((row) => summary(row)), total, page, pageSize: PAGE_SIZE };
  }

  async create(actor: BoardActor, input: SuggestionCreateInput): Promise<SuggestionDetail> {
    const data = readSuggestionCreate(input);
    return this.write(async (tx) => {
      const created = await tx.feedbackSuggestion.create({ data: { ...data, authorId: actor.userId } });
      return this.loadDetail(tx, actor, created.id);
    });
  }

  async detail(actor: BoardActor, id: string): Promise<SuggestionDetail> {
    readBoardId(id);
    return this.client.$transaction((tx) => this.loadDetail(tx, actor, id));
  }

  private async loadDetail(tx: Tx, actor: BoardActor, id: string): Promise<SuggestionDetail> {
    const row = await tx.feedbackSuggestion.findUnique({ where: { id }, include: {
      ...summaryInclude(actor.userId), relatedSuggestion: { select: { id: true, title: true } },
      events: { include: { actor: { select: authorSelect } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    } });
    if (!row) notFound();
    const comments = await this.loadComments(tx, id);
    return {
      ...summary(row, row.events.at(-1)), content: row.content, comments: comments.items, nextCommentCursor: comments.nextCursor,
      relatedSuggestion: row.relatedSuggestion,
      events: row.events.map((event) => ({ id: event.id, actor: author(event.actor), note: event.note,
        fromStatus: event.fromStatus, toStatus: event.toStatus, createdAt: event.createdAt.toISOString() })),
    };
  }

  async comments(_actor: BoardActor, id: string, cursor?: string): Promise<{ items: SuggestionComment[]; nextCursor: string | null }> {
    readBoardId(id);
    return this.client.$transaction(async (tx) => {
      if (!await tx.feedbackSuggestion.findUnique({ where: { id }, select: { id: true } })) notFound();
      return this.loadComments(tx, id, cursor);
    });
  }

  private async loadComments(tx: Tx, suggestionId: string, cursor?: string) {
    const where: Prisma.FeedbackCommentWhereInput = { suggestionId };
    if (cursor !== undefined) {
      const previous = await tx.feedbackComment.findFirst({ where: { id: readBoardId(cursor), suggestionId }, select: { id: true, createdAt: true } });
      if (!previous) throw new AppError("validation_error", "评论分页标识无效。", 400);
      where.OR = [{ createdAt: { gt: previous.createdAt } }, { createdAt: previous.createdAt, id: { gt: previous.id } }];
    }
    const rows = await tx.feedbackComment.findMany({ where, include: commentInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: COMMENT_PAGE_SIZE + 1 });
    return { items: rows.slice(0, COMMENT_PAGE_SIZE).map(commentDto),
      nextCursor: rows.length > COMMENT_PAGE_SIZE ? rows[COMMENT_PAGE_SIZE - 1].id : null };
  }

  async setLike(actor: BoardActor, id: string, liked: boolean): Promise<{ liked: boolean; likeCount: number }> {
    if (typeof liked !== "boolean") throw new AppError("validation_error", "点赞状态无效。", 400);
    return this.write(async (tx) => {
      // Serialize set/unset for a suggestion; the composite PK remains the database uniqueness guard.
      await this.lock(tx, id);
      if (liked) await tx.feedbackLike.createMany({ data: [{ suggestionId: id, userId: actor.userId }], skipDuplicates: true });
      else await tx.feedbackLike.deleteMany({ where: { suggestionId: id, userId: actor.userId } });
      return { liked, likeCount: await tx.feedbackLike.count({ where: { suggestionId: id } }) };
    });
  }

  async comment(actor: BoardActor, id: string, input: SuggestionCommentInput): Promise<SuggestionComment> {
    const data = readSuggestionComment(input);
    return this.write(async (tx) => {
      await this.lock(tx, id);
      const replyTo = data.replyToId ? await tx.feedbackComment.findFirst({
        where: { id: data.replyToId, suggestionId: id, hiddenAt: null }, select: { id: true, authorId: true },
      }) : null;
      if (data.replyToId && !replyTo) throw new AppError("validation_error", "被回复的评论无效或已移除。", 400);
      const row = await tx.feedbackComment.create({ data: { suggestionId: id, authorId: actor.userId,
        content: data.content, replyToId: replyTo?.id ?? null }, include: commentInclude });
      if (replyTo && replyTo.authorId !== actor.userId) await tx.feedbackNotification.create({ data: {
        userId: replyTo.authorId, suggestionId: id, message: "有人回复了你在建议中的评论。",
      } });
      return commentDto(row);
    });
  }

  async update(actor: BoardActor, id: string, input: SuggestionUpdateInput): Promise<SuggestionDetail> {
    manager(actor);
    const data = readSuggestionUpdate(input);
    if (data.relatedSuggestionId === id) throw new AppError("validation_error", "不能关联建议自身。", 400);
    return this.write(async (tx) => {
      await this.lock(tx, id);
      const current = await tx.feedbackSuggestion.findUniqueOrThrow({ where: { id } });
      if (data.relatedSuggestionId && !await tx.feedbackSuggestion.findUnique({ where: { id: data.relatedSuggestionId }, select: { id: true } })) {
        throw new AppError("validation_error", "关联建议不存在。", 400);
      }
      const changed = await tx.feedbackSuggestion.updateMany({
        where: { id, updatedAt: new Date(data.expectedUpdatedAt) },
        data: { category: data.category, status: data.status, relatedSuggestionId: data.relatedSuggestionId,
          // Always advance, including two edits in the same millisecond.
          updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) },
      });
      if (!changed.count) throw new AppError("invalid_transition", "建议已被其他人更新，请刷新后重试。", 409);
      await tx.feedbackEvent.create({ data: { suggestionId: id, actorId: actor.userId,
        fromStatus: current.status, toStatus: data.status, note: data.note } });
      if (current.status !== data.status && current.authorId !== actor.userId) {
        const label = SUGGESTION_STATUSES.find(({ value }) => value === data.status)!.label;
        await tx.feedbackNotification.create({ data: { userId: current.authorId, suggestionId: id,
          message: `你提出的建议状态已更新为“${label}”。` } });
      }
      return this.loadDetail(tx, actor, id);
    });
  }

  async hideComment(actor: BoardActor, suggestionId: string, commentId: string): Promise<void> {
    manager(actor);
    readBoardId(commentId);
    await this.write(async (tx) => {
      await this.lock(tx, suggestionId);
      const row = await tx.feedbackComment.findFirst({ where: { id: commentId, suggestionId }, select: { id: true, hiddenAt: true } });
      if (!row) notFound();
      if (!row.hiddenAt) await tx.feedbackComment.update({ where: { id: commentId }, data: { hiddenAt: new Date() } });
    });
  }

  async notifications(actor: BoardActor, cursor?: string): Promise<BoardNotificationResult> {
    return this.client.$transaction(async (tx) => {
      const where: Prisma.FeedbackNotificationWhereInput = { userId: actor.userId };
      if (cursor !== undefined) {
        const previous = await tx.feedbackNotification.findFirst({ where: { id: readBoardId(cursor), userId: actor.userId }, select: { id: true, createdAt: true } });
        if (!previous) throw new AppError("validation_error", "通知分页标识无效。", 400);
        where.OR = [{ createdAt: { lt: previous.createdAt } }, { createdAt: previous.createdAt, id: { lt: previous.id } }];
      }
      const rows = await tx.feedbackNotification.findMany({ where,
        include: { suggestion: { select: { title: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: NOTIFICATION_PAGE_SIZE + 1 });
      return {
        items: rows.slice(0, NOTIFICATION_PAGE_SIZE).map((row) => ({
          id: row.id, suggestionId: row.suggestionId, title: row.suggestion.title, message: row.message,
          createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null,
        })),
        unreadCount: await tx.feedbackNotification.count({ where: { userId: actor.userId, readAt: null } }),
        nextCursor: rows.length > NOTIFICATION_PAGE_SIZE ? rows[NOTIFICATION_PAGE_SIZE - 1].id : null,
      };
    });
  }

  async markNotificationsRead(actor: BoardActor, ids: string[]): Promise<void> {
    if (!Array.isArray(ids) || ids.length > 100) throw new AppError("validation_error", "每次最多标记 100 条通知。", 400);
    ids.forEach(readBoardId);
    if (!ids.length) return;
    // Deliberately do not return counts: foreign and nonexistent IDs have identical behavior.
    await this.client.feedbackNotification.updateMany({ where: { id: { in: ids }, userId: actor.userId, readAt: null }, data: { readAt: new Date() } });
  }
}

export const feedbackBoard = new FeedbackBoardService();

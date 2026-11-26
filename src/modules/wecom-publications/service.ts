import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type WecomPublicationDraft, type WecomPublicationTask, type WecomPublicationDelivery } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";
import type { NewPublicationDraft, PublicationActor, PublicationChannel, PublicationDraft, PublicationTask, PublicationTarget, RecipientIssues } from "./contracts";
import { persistPublicationDraft, readPublicationDraft } from "./storage";

export type PublicationTransaction = Prisma.TransactionClient;
type TaskWithRelations = WecomPublicationTask & { draft: WecomPublicationDraft; deliveries: WecomPublicationDelivery[] };

export function publicationJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function publicationTransaction<T>(run: (tx: PublicationTransaction) => Promise<T>, client: PrismaClient = prisma): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) {
      if (attempt >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2002", "P2034"].includes(error.code)) throw error;
    }
  }
}

export async function publicationAudit(tx: PublicationTransaction, action: string, taskId: string | null, actor: unknown, detail: unknown, now = new Date()) {
  await tx.wecomPublicationAudit.create({ data: { id: randomUUID(), taskId, action, actor: publicationJson(actor), detail: publicationJson(detail), createdAt: now } });
}

function draftView(row: WecomPublicationDraft): PublicationDraft {
  return { id: row.id, title: row.title, digest: row.digest, ...(row.author ? { author: row.author } : {}), ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}), createdAt: row.createdAt.toISOString() };
}

function taskView(row: TaskWithRelations): PublicationTask {
  return {
    id: row.id, draft: draftView(row.draft), scheduledAt: row.scheduledAt.toISOString(), createdAt: row.createdAt.toISOString(), actor: row.actor as PublicationActor,
    deliveries: row.deliveries.map(delivery => ({
      channel: delivery.channel as PublicationChannel, audience: delivery.audience as PublicationTarget["audience"], status: delivery.status as PublicationTask["deliveries"][number]["status"], attempts: delivery.attempts,
      ...(delivery.attemptedAt ? { attemptedAt: delivery.attemptedAt.toISOString() } : {}), ...(delivery.finishedAt ? { finishedAt: delivery.finishedAt.toISOString() } : {}),
      ...(delivery.messageId ? { messageId: delivery.messageId } : {}), ...(delivery.errorCode ? { errorCode: delivery.errorCode } : {}), ...(delivery.errorMessage ? { errorMessage: delivery.errorMessage } : {}),
      ...(delivery.issues ? { issues: delivery.issues as RecipientIssues } : {}),
    })),
  };
}

export async function savePublicationDraft(input: NewPublicationDraft, actor: PublicationActor): Promise<PublicationDraft> {
  const id = randomUUID();
  const checksum = await persistPublicationDraft(id, input);
  const now = new Date();
  return publicationTransaction(async tx => {
    const row = await tx.wecomPublicationDraft.create({ data: { id, title: input.article.title, digest: input.article.digest, author: input.article.author, sourceUrl: input.article.sourceUrl, checksum, actor: publicationJson(actor), createdAt: now } });
    await publicationAudit(tx, "draft_created", null, actor, { draftId: id, checksum }, now);
    return draftView(row);
  });
}

export async function loadPublicationDraft(id: string): Promise<NewPublicationDraft> {
  const row = await prisma.wecomPublicationDraft.findUnique({ where: { id } });
  if (!row) throw new AppError("not_found", "稿件不存在。", 404);
  return readPublicationDraft(id, row.checksum);
}

export async function listPublicationTasks(): Promise<PublicationTask[]> {
  const rows = await prisma.wecomPublicationTask.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { draft: true, deliveries: { orderBy: { channel: "asc" } } } });
  return rows.map(taskView);
}

export async function getPublicationTask(id: string): Promise<PublicationTask> {
  return readTask(prisma, id);
}

async function readTask(tx: Pick<PublicationTransaction, "wecomPublicationTask">, id: string): Promise<PublicationTask> {
  const row = await tx.wecomPublicationTask.findUnique({ where: { id }, include: { draft: true, deliveries: { orderBy: { channel: "asc" } } } });
  if (!row) throw new AppError("not_found", "发布任务不存在。", 404);
  return taskView(row);
}

function requestIdentity(operation: string, actor: PublicationActor, requestId: string, payload: unknown) {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(requestId)) throw new AppError("validation_error", "请提供有效的请求编号。", 422);
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return { id: hash([operation, actor.userId, requestId]), checksum: hash(payload) };
}

async function previousRequest(tx: PublicationTransaction, id: string, checksum: string): Promise<PublicationTask | undefined> {
  const previous = await tx.wecomPublicationRequest.findUnique({ where: { id } });
  if (!previous) return undefined;
  if (previous.checksum !== checksum) throw new AppError("invalid_transition", "请求编号已经用于其他内容，请刷新后重新确认。", 409);
  return readTask(tx, previous.taskId);
}

function normalizeTargets(targets: PublicationTarget[]): PublicationTarget[] {
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 2 || new Set(targets.map(target => target.channel)).size !== targets.length) throw new AppError("validation_error", "请选择一个或两个独立应用。", 422);
  return targets.map((target): PublicationTarget => {
    if (target.channel !== "group" && target.channel !== "auto") throw new AppError("validation_error", "应用无效。", 422);
    const audience = target.audience;
    if (audience?.kind === "all") return { channel: target.channel, audience: { kind: "all" } };
    if (!audience || !["members", "departments"].includes(audience.kind) || !Array.isArray(audience.ids) || !audience.ids.length || audience.ids.length > (audience.kind === "members" ? 1000 : 100)) throw new AppError("validation_error", "请填写有效的成员或部门。", 422);
    const ids = [...new Set(audience.ids.map(id => typeof id === "string" ? id.trim() : ""))].sort();
    const valid = audience.kind === "departments" ? /^[1-9]\d{0,18}$/ : /^[A-Za-z0-9_@.\-]{1,128}$/;
    if (ids.some(id => !valid.test(id) || id.toLowerCase() === "@all")) throw new AppError("validation_error", "成员账号或部门 ID 无效。", 422);
    return { channel: target.channel, audience: { kind: audience.kind, ids } };
  }).sort((a, b) => a.channel.localeCompare(b.channel));
}

export async function schedulePublication(input: { draftId: string; scheduledAt: Date; targets: PublicationTarget[]; requestId: string }, actor: PublicationActor): Promise<PublicationTask> {
  const targets = normalizeTargets(input.targets);
  if (!(input.scheduledAt instanceof Date) || !Number.isFinite(input.scheduledAt.getTime())) throw new AppError("validation_error", "发送时间无效。", 422);
  const identity = requestIdentity("schedule", actor, input.requestId, { draftId: input.draftId, scheduledAt: input.scheduledAt.toISOString(), targets });
  return publicationTransaction(async tx => {
    const previous = await previousRequest(tx, identity.id, identity.checksum);
    if (previous) return previous;
    const now = new Date();
    if (input.scheduledAt.getTime() < now.getTime() - 5000) throw new AppError("validation_error", "发送时间已经过去，请重新确认。", 422);
    const draft = await tx.wecomPublicationDraft.findUnique({ where: { id: input.draftId } });
    if (!draft) throw new AppError("not_found", "稿件不存在。", 404);
    const id = randomUUID();
    await tx.wecomPublicationTask.create({ data: { id, draftId: draft.id, scheduledAt: input.scheduledAt, createdAt: now, actor: publicationJson(actor), deliveries: { create: targets.map(target => ({ id: randomUUID(), channel: target.channel, audience: publicationJson(target.audience), status: "queued" })) } } });
    await tx.wecomPublicationRequest.create({ data: { ...identity, taskId: id } });
    await publicationAudit(tx, "scheduled", id, actor, { draftId: draft.id, scheduledAt: input.scheduledAt.toISOString(), targets }, now);
    return readTask(tx, id);
  });
}

export async function retryPublicationDelivery(taskId: string, channel: PublicationChannel, requestId: string, actor: PublicationActor): Promise<PublicationTask> {
  const identity = requestIdentity("retry", actor, requestId, { taskId, channel });
  return publicationTransaction(async tx => {
    const previous = await previousRequest(tx, identity.id, identity.checksum);
    if (previous) return previous;
    const delivery = await tx.wecomPublicationDelivery.findUnique({ where: { taskId_channel: { taskId, channel } } });
    if (!delivery) throw new AppError("not_found", "该应用的发布记录不存在。", 404);
    if (delivery.status !== "failed") throw new AppError("invalid_transition", "仅明确失败的应用可重试。待核验任务请先确认实际收件结果。", 409);
    const changed = await tx.wecomPublicationDelivery.updateMany({ where: { id: delivery.id, status: "failed", attempts: delivery.attempts }, data: { status: "queued", attemptedAt: null, finishedAt: null, messageId: null, errorCode: null, errorMessage: null, issues: Prisma.DbNull, leaseToken: null, leaseUntil: null } });
    if (!changed.count) throw new AppError("invalid_transition", "发布状态已变化，请刷新后重试。", 409);
    await tx.wecomPublicationRequest.create({ data: { ...identity, taskId } });
    await publicationAudit(tx, "retry_requested", taskId, actor, { channel, previousAttempt: delivery.attempts });
    return readTask(tx, taskId);
  });
}

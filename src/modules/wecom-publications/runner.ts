import { randomUUID } from "node:crypto";
import { Prisma, type WecomPublicationDelivery } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { createChannelAdapter, PublicationPreparationError } from "./channels";
import { publicationEnabled } from "./configuration";
import type { DeliveryOutcome, PublicationChannel, PublicationAudience } from "./contracts";
import { loadPublicationDraft, publicationAudit, publicationJson, publicationTransaction } from "./service";

const LEASE_MS = 120000;
const HEARTBEAT_MS = 20000;
const WORKER_ACTOR = { channel: "worker" };

/** A lost sending lease is deliberately excluded from future automatic claims. */
async function recoverExpiredLeases(now: Date) {
  const expired = await prisma.wecomPublicationDelivery.findMany({ where: { status: { in: ["preparing", "sending"] }, leaseUntil: { lt: now } }, take: 50 });
  for (const delivery of expired) {
    await publicationTransaction(async tx => {
      const sending = delivery.status === "sending";
      const status = sending ? "unknown" : "queued";
      const outcome = sending
        ? { status: "unknown", code: "execution_interrupted", message: "发送期间执行程序中断，请核验实际收件结果。" }
        : { status: "failed", code: "preparation_interrupted", message: "素材准备中断，将重新准备。" };
      const changed = await tx.wecomPublicationDelivery.updateMany({
        where: { id: delivery.id, status: delivery.status, leaseToken: delivery.leaseToken, leaseUntil: { lt: now } },
        data: { status, leaseUntil: null, ...(sending ? { errorCode: outcome.code, errorMessage: outcome.message, finishedAt: now } : { leaseToken: null }) },
      });
      if (!changed.count) return;
      await tx.wecomPublicationAttempt.updateMany({ where: { deliveryId: delivery.id, number: delivery.attempts }, data: { status: outcome.status, finishedAt: now, outcome: publicationJson(outcome) } });
      await publicationAudit(tx, "lease_expired", delivery.taskId, WORKER_ACTOR, { channel: delivery.channel, attempt: delivery.attempts, outcome }, now);
    });
  }
}

async function claimDelivery(now: Date): Promise<WecomPublicationDelivery | undefined> {
  return publicationTransaction(async tx => {
    const candidate = await tx.wecomPublicationDelivery.findFirst({ where: { status: "queued", task: { scheduledAt: { lte: now } } }, orderBy: [{ task: { scheduledAt: "asc" } }, { id: "asc" }] });
    if (!candidate) return undefined;
    const token = randomUUID();
    const changed = await tx.wecomPublicationDelivery.updateMany({
      where: { id: candidate.id, status: "queued", attempts: candidate.attempts },
      data: { status: "preparing", attempts: { increment: 1 }, attemptedAt: now, finishedAt: null, errorCode: null, errorMessage: null, messageId: null, issues: Prisma.DbNull, leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS) },
    });
    if (!changed.count) return undefined;
    const number = candidate.attempts + 1;
    await tx.wecomPublicationAttempt.create({ data: { id: randomUUID(), deliveryId: candidate.id, number, status: "preparing", startedAt: now } });
    await publicationAudit(tx, "attempt_started", candidate.taskId, WORKER_ACTOR, { channel: candidate.channel, attempt: number }, now);
    return { ...candidate, status: "preparing", attempts: number, leaseToken: token };
  });
}

async function beginSending(delivery: WecomPublicationDelivery): Promise<boolean> {
  return publicationTransaction(async tx => {
    const now = new Date();
    const changed = await tx.wecomPublicationDelivery.updateMany({
      where: { id: delivery.id, status: "preparing", leaseToken: delivery.leaseToken, leaseUntil: { gt: now } },
      data: { status: "sending", leaseUntil: new Date(now.getTime() + LEASE_MS) },
    });
    if (!changed.count) return false;
    await tx.wecomPublicationAttempt.updateMany({ where: { deliveryId: delivery.id, number: delivery.attempts }, data: { status: "sending" } });
    await publicationAudit(tx, "send_started", delivery.taskId, WORKER_ACTOR, { channel: delivery.channel, attempt: delivery.attempts }, now);
    return true;
  });
}

async function finishDelivery(delivery: WecomPublicationDelivery, outcome: DeliveryOutcome, sent: boolean) {
  await publicationTransaction(async tx => {
    const now = new Date();
    const result = "messageId" in outcome
      ? { messageId: outcome.messageId, errorCode: null, errorMessage: null }
      : { messageId: null, errorCode: outcome.code, errorMessage: outcome.message };
    const changed = await tx.wecomPublicationDelivery.updateMany({
      where: { id: delivery.id, leaseToken: delivery.leaseToken, status: { in: sent ? ["sending", "unknown"] : ["preparing"] } },
      data: { status: outcome.status, finishedAt: now, leaseUntil: null, leaseToken: null, ...result, issues: outcome.issues ? publicationJson(outcome.issues) : Prisma.DbNull },
    });
    if (!changed.count) return;
    await tx.wecomPublicationAttempt.updateMany({ where: { deliveryId: delivery.id, number: delivery.attempts }, data: { status: outcome.status, finishedAt: now, outcome: publicationJson(outcome) } });
    await publicationAudit(tx, "attempt_finished", delivery.taskId, WORKER_ACTOR, { channel: delivery.channel, attempt: delivery.attempts, outcome }, now);
  });
}

/** Process one channel per cycle. HTTP callers never execute the send themselves. */
export async function runPublicationCycle(options: { adapterFactory?: typeof createChannelAdapter } = {}): Promise<boolean> {
  if (!publicationEnabled()) return false;
  const now = new Date();
  await recoverExpiredLeases(now);
  const delivery = await claimDelivery(now);
  if (!delivery) return false;

  let sending = false;
  let outcome: DeliveryOutcome | undefined;
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void prisma.wecomPublicationDelivery.updateMany({
      where: { id: delivery.id, leaseToken: delivery.leaseToken, status: { in: ["preparing", "sending"] } },
      data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
    }).catch(() => { /* The send transition still requires an unexpired database lease. */ }).finally(() => { renewing = false; });
  }, HEARTBEAT_MS);
  heartbeat.unref();

  try {
    const task = await prisma.wecomPublicationTask.findUniqueOrThrow({ where: { id: delivery.taskId } });
    const draft = await loadPublicationDraft(task.draftId);
    const adapter = (options.adapterFactory ?? createChannelAdapter)(delivery.channel as PublicationChannel);
    const prepared = await adapter.prepare(draft.article, draft.cover, draft.images);
    // Cancellation or loss of the lease during preparation prevents any network send.
    if (!await beginSending(delivery)) return true;
    sending = true;
    outcome = await adapter.send(prepared, delivery.audience as PublicationAudience);
  } catch (error) {
    outcome = sending
      ? { status: "unknown", code: "execution_unconfirmed", message: "未能确认企微是否受理，请核验实际收件结果。" }
      : { status: "failed", code: error instanceof PublicationPreparationError ? error.code : "preparation_failed", message: error instanceof PublicationPreparationError ? error.message : "素材准备失败，请检查稿件、应用配置和持久化存储后重试。" };
  } finally {
    clearInterval(heartbeat);
  }
  if (outcome) await finishDelivery(delivery, outcome, sending);
  return true;
}

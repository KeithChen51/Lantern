import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { WecomPublicationDraft, WecomPublicationTask, WecomPublicationDelivery } from "@prisma/client";
import type { PublicationActor } from "./contracts";

const state = vi.hoisted(() => ({
  drafts: new Map<string, WecomPublicationDraft>(),
  tasks: new Map<string, WecomPublicationTask>(),
  deliveries: [] as WecomPublicationDelivery[],
  requests: new Map<string, { id: string; checksum: string; taskId: string }>(),
  audit: vi.fn(),
}));

vi.mock("./storage", () => ({ persistPublicationDraft: vi.fn(async () => "checksum"), readPublicationDraft: vi.fn() }));
vi.mock("@/infrastructure/db", () => {
  type TaskData = WecomPublicationTask & { deliveries: { create: Array<Pick<WecomPublicationDelivery, "id" | "channel" | "audience" | "status">> } };
  let transactionQueue: Promise<unknown> = Promise.resolve();
  const db = {
    wecomPublicationDraft: {
      create: vi.fn(async ({ data }: { data: WecomPublicationDraft }) => { state.drafts.set(data.id, data); return data; }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.drafts.get(where.id) ?? null),
    },
    wecomPublicationTask: {
      create: vi.fn(async ({ data }: { data: TaskData }) => {
        state.tasks.set(data.id, data);
        for (const target of data.deliveries.create) state.deliveries.push({ ...target, taskId: data.id, attempts: 0, attemptedAt: null, finishedAt: null, messageId: null, errorCode: null, errorMessage: null, issues: null, leaseToken: null, leaseUntil: null });
        return data;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const task = state.tasks.get(where.id);
        return task ? { ...task, draft: state.drafts.get(task.draftId), deliveries: state.deliveries.filter(delivery => delivery.taskId === task.id) } : null;
      }),
      findMany: vi.fn(async () => []),
    },
    wecomPublicationRequest: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.requests.get(where.id) ?? null),
      create: vi.fn(async ({ data }: { data: { id: string; checksum: string; taskId: string } }) => { state.requests.set(data.id, data); return data; }),
    },
    wecomPublicationDelivery: {
      findUnique: vi.fn(async ({ where }: { where: { taskId_channel: { taskId: string; channel: string } } }) => state.deliveries.find(delivery => delivery.taskId === where.taskId_channel.taskId && delivery.channel === where.taskId_channel.channel) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string; attempts: number }; data: Partial<WecomPublicationDelivery> }) => {
        const row = state.deliveries.find(delivery => delivery.id === where.id && delivery.status === where.status && delivery.attempts === where.attempts);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    wecomPublicationAudit: { create: state.audit },
    $transaction: async (run: (transaction: unknown) => Promise<unknown>) => {
      const next = transactionQueue.then(() => run(db));
      transactionQueue = next.catch(() => undefined);
      return next;
    },
  };
  return { prisma: db };
});

import { retryPublicationDelivery, schedulePublication } from "./service";

const actor: PublicationActor = { userId: "admin-1", account: "operator", channel: "cli" };
const scheduledAt = new Date("2026-11-26T02:00:00Z");
const targets = [
  { channel: "group", audience: { kind: "members", ids: ["member-1"] } },
  { channel: "auto", audience: { kind: "departments", ids: ["12"] } },
] as const;
function schedule(requestId = "request-001") {
  return { draftId: "draft-1", scheduledAt, targets: targets.map(target => ({ channel: target.channel, audience: { ...target.audience, ids: [...target.audience.ids] } })), requestId };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-26T01:00:00Z"));
  state.drafts.clear(); state.tasks.clear(); state.deliveries = []; state.requests.clear();
  state.drafts.set("draft-1", { id: "draft-1", title: "刊物", digest: "摘要", author: null, sourceUrl: null, checksum: "checksum", actor, createdAt: new Date() });
});
afterEach(() => { vi.useRealTimers(); });

describe("publication scheduling", () => {
  it("persists one immutable task and two independent channel deliveries for concurrent repeated submission", async () => {
    const [first, duplicate] = await Promise.all([schedulePublication(schedule(), actor), schedulePublication(schedule(), actor)]);
    expect(first.id).toBe(duplicate.id);
    expect(state.tasks.size).toBe(1);
    expect(first.deliveries).toHaveLength(2);
    expect(first.actor).toEqual(actor);
    expect(first.scheduledAt).toBe("2026-11-26T02:00:00.000Z");
    expect(state.audit).toHaveBeenCalledTimes(1);
  });

  it("returns a repeated request after its scheduled time and rejects changed content under the same key", async () => {
    const created = await schedulePublication(schedule(), actor);
    vi.setSystemTime(new Date("2026-11-26T03:00:00Z"));
    expect((await schedulePublication(schedule(), actor)).id).toBe(created.id);
    await expect(schedulePublication({ ...schedule(), scheduledAt: new Date("2026-11-26T04:00:00Z") }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it("requeues only a failed channel once and preserves a successful sibling", async () => {
    const created = await schedulePublication(schedule(), actor);
    const group = state.deliveries.find(delivery => delivery.channel === "group")!;
    const auto = state.deliveries.find(delivery => delivery.channel === "auto")!;
    Object.assign(group, { status: "failed", attempts: 1, errorCode: "wecom_60020" });
    Object.assign(auto, { status: "accepted", attempts: 1, messageId: "receipt" });
    await retryPublicationDelivery(created.id, "group", "retry-001", actor);
    await retryPublicationDelivery(created.id, "group", "retry-001", actor);
    expect(group).toMatchObject({ status: "queued", attempts: 1, errorCode: null });
    expect(auto).toMatchObject({ status: "accepted", attempts: 1, messageId: "receipt" });
    expect(state.audit).toHaveBeenCalledTimes(2);
  });

  it.each(["unknown", "partial", "accepted", "sending", "queued"])("refuses to retry %s", async status => {
    const created = await schedulePublication(schedule(), actor);
    state.deliveries[0].status = status;
    await expect(retryPublicationDelivery(created.id, state.deliveries[0].channel as "group", "retry-001", actor)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a past time, duplicate apps, and recipient injection", async () => {
    await expect(schedulePublication({ ...schedule(), scheduledAt: new Date("2026-11-26T00:00:00Z") }, actor)).rejects.toMatchObject({ status: 422 });
    await expect(schedulePublication({ ...schedule(), targets: [schedule().targets[0], schedule().targets[0]] }, actor)).rejects.toMatchObject({ status: 422 });
    await expect(schedulePublication({ ...schedule(), targets: [{ channel: "group", audience: { kind: "members", ids: ["member|@all"] } }] }, actor)).rejects.toMatchObject({ status: 422 });
    expect(state.tasks.size).toBe(0);
  });
});

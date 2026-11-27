import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WecomPublicationDelivery } from "@prisma/client";

const state = vi.hoisted(() => ({
  enabled: true,
  rows: [] as WecomPublicationDelivery[],
  prepare: vi.fn(), send: vi.fn(), audit: vi.fn(), attemptCreate: vi.fn(), attemptUpdate: vi.fn(),
  load: vi.fn(),
}));

type Where = { id?: string; status?: string | { in: string[] }; attempts?: number; leaseToken?: string | null; leaseUntil?: { gt?: Date; lt?: Date } };
function matches(row: WecomPublicationDelivery, where: Where) {
  return (where.id === undefined || row.id === where.id)
    && (where.attempts === undefined || row.attempts === where.attempts)
    && (where.leaseToken === undefined || row.leaseToken === where.leaseToken)
    && (where.status === undefined || (typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status)))
    && (!where.leaseUntil?.lt || Boolean(row.leaseUntil && row.leaseUntil < where.leaseUntil.lt))
    && (!where.leaseUntil?.gt || Boolean(row.leaseUntil && row.leaseUntil > where.leaseUntil.gt));
}

vi.mock("@/infrastructure/db", () => {
  const db = {
    wecomPublicationDelivery: {
      findMany: vi.fn(async ({ where }: { where: Where }) => state.rows.filter(row => matches(row, where)).map(row => ({ ...row }))),
      findFirst: vi.fn(async () => {
        const row = state.rows.find(item => item.status === "queued");
        return row ? { ...row } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        let count = 0;
        for (const row of state.rows.filter(item => matches(item, where))) {
          const attempts = typeof data.attempts === "object" ? row.attempts + 1 : row.attempts;
          Object.assign(row, data, { attempts });
          count += 1;
        }
        return { count };
      }),
    },
    wecomPublicationAttempt: { create: state.attemptCreate, updateMany: state.attemptUpdate },
    wecomPublicationTask: { findUniqueOrThrow: vi.fn(async () => ({ draftId: "draft" })) },
  };
  return { prisma: db };
});
vi.mock("./configuration", () => ({ publicationEnabled: () => state.enabled }));
vi.mock("./channels", () => ({
  createChannelAdapter: () => ({ prepare: state.prepare, send: state.send }),
  PublicationPreparationError: class extends Error { constructor(public code: string, message: string) { super(message); } },
}));
vi.mock("./service", async () => {
  const { prisma } = await import("@/infrastructure/db");
  return { loadPublicationDraft: state.load, publicationTransaction: (run: (db: unknown) => Promise<unknown>) => run(prisma), publicationAudit: state.audit, publicationJson: (input: unknown) => input };
});

import { runPublicationCycle } from "./runner";

function delivery(status = "queued"): WecomPublicationDelivery {
  return { id: "delivery-1", taskId: "task-1", channel: "group", audience: { kind: "all" }, status, attempts: 0, attemptedAt: null, finishedAt: null, messageId: null, errorCode: null, errorMessage: null, issues: null, leaseToken: null, leaseUntil: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = true;
  state.rows = [delivery()];
  state.prepare.mockResolvedValue({ title: "稿件", html: "正文", digest: "摘要", coverMediaId: "cover" });
  state.send.mockResolvedValue({ status: "accepted", messageId: "receipt", issues: { invalidUsers: [], invalidDepartments: [], invalidTags: [], unlicensedUsers: [] } });
  state.load.mockResolvedValue({ article: {}, cover: {}, images: [] });
});

describe("durable send execution", () => {
  it("never touches a queue while execution is disabled", async () => {
    state.enabled = false;
    expect(await runPublicationCycle()).toBe(false);
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.rows[0].status).toBe("queued");
  });

  it("records one accepted attempt while concurrent workers claim the same delivery", async () => {
    await Promise.all([runPublicationCycle(), runPublicationCycle()]);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.rows[0]).toMatchObject({ status: "accepted", attempts: 1, messageId: "receipt", leaseToken: null });
    expect(state.attemptCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps a lost send response unknown and excludes it from future sends", async () => {
    state.send.mockRejectedValue(new Error("connection dropped"));
    await runPublicationCycle();
    expect(state.rows[0]).toMatchObject({ status: "unknown", errorCode: "execution_unconfirmed" });
    expect(await runPublicationCycle()).toBe(false);
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("recovers expired sending as unknown without another API request", async () => {
    state.rows = [{ ...delivery("sending"), attempts: 1, leaseToken: "old-worker", leaseUntil: new Date(Date.now() - 1) }];
    expect(await runPublicationCycle()).toBe(false);
    expect(state.rows[0]).toMatchObject({ status: "unknown", errorCode: "execution_interrupted" });
    expect(state.send).not.toHaveBeenCalled();
  });

  it("can reclaim expired preparation and retains its old failed attempt", async () => {
    state.rows = [{ ...delivery("preparing"), attempts: 1, leaseToken: "old-worker", leaseUntil: new Date(Date.now() - 1) }];
    await runPublicationCycle();
    expect(state.rows[0]).toMatchObject({ status: "accepted", attempts: 2 });
    expect(state.attemptUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed", outcome: expect.objectContaining({ code: "preparation_interrupted" }) }) }));
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("marks a preparation error failed while leaving send untouched", async () => {
    state.prepare.mockRejectedValue(new Error("invalid image"));
    await runPublicationCycle();
    expect(state.rows[0]).toMatchObject({ status: "failed", errorCode: "preparation_failed" });
    expect(state.send).not.toHaveBeenCalled();
  });

  it("does not send after the preparing lease is lost", async () => {
    state.prepare.mockImplementationOnce(async () => {
      state.rows[0].leaseToken = "replacement-worker";
      return { coverMediaId: "cover" };
    });
    await runPublicationCycle();
    expect(state.send).not.toHaveBeenCalled();
  });

  it("preserves invalid recipients alongside a successful receipt", async () => {
    state.send.mockResolvedValueOnce({ status: "partial", messageId: "receipt", issues: { invalidUsers: ["bad-user"], invalidDepartments: [], invalidTags: [], unlicensedUsers: [] } });
    await runPublicationCycle();
    expect(state.rows[0]).toMatchObject({ status: "partial", messageId: "receipt", issues: { invalidUsers: ["bad-user"] } });
  });
});

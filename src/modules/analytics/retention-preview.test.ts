import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getRetentionPreview, parseRetentionPreviewArgs } from "./retention-preview";

const now = new Date("2026-10-31T08:00:00.000Z");
const row = (actor: string, counts: Partial<Record<string, bigint | number>> = {}) => ({ actor,
  sessions: 5, without_user_message: 1, future_user_message: 0, normal_expired: 3,
  legacy_expired: 2, post_notice_expired: 1, time_conditions_met: 1, ...counts });
function database(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue(rows);
  return { client: { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">, query };
}

describe("retention preview notice arguments", () => {
  it("records no notice unless an explicit actual instant is supplied", () => {
    expect(parseRetentionPreviewArgs([], now)).toEqual({ now });
    expect(parseRetentionPreviewArgs(["--notice-at", "2026-10-01T16:00:00+08:00"], now).noticeAt?.toISOString()).toBe("2026-10-01T08:00:00.000Z");
    expect(parseRetentionPreviewArgs(["--notice-at", now.toISOString()], now).noticeAt).toEqual(now);
  });

  it.each([
    ["--apply"], ["--as-of", "2026-10-31"], ["--notice-at"],
    ["--notice-at", "2026-10-01"], ["--notice-at", "2026-10-01T08:00:00"],
    ["--notice-at", "2026-02-30T00:00:00Z"], ["--notice-at", "2026-10-31T08:00:00.001Z"],
    ["--notice-at", "2026-10-01T24:00:00Z"], ["--notice-at", "2026-10-01T00:00:00+14:01"],
    ["--notice-at", "2026-10-01T00:00:00Z", "--notice-at", "2026-10-01T00:00:00Z"],
  ])("rejects invalid or unsupported arguments %j", (...args) => {
    expect(() => parseRetentionPreviewArgs(args, now)).toThrow();
  });
});

describe("retention preview aggregates", () => {
  it("keeps unknown ownership and missing USER messages separate without treating them as deletable", async () => {
    const db = database([row("employee"), row("guest", { sessions: BigInt(6) }), row("unknown")]);
    const report = await getRetentionPreview(db.client, { now });
    expect(report.groups.employee).toEqual({ sessions: 5, withoutUserMessage: 1, futureUserMessage: 0,
      expiredUnderNormalPolicy: 3, legacyExpiredAwaitingGrace: null, postNoticeExpired: null, passesTimeConditions: null });
    expect(report.groups.guest.sessions).toBe(6);
    expect(report.groups.unknown.expiredUnderNormalPolicy).toBeNull();
    expect(report.groups.unknown.passesTimeConditions).toBeNull();
    expect(report.noticeStatus).toBe("notice_not_recorded");
    expect(report.timeBasis).toContain("backfilled");
  });

  it("uses 30 complete days for legacy grace, including exact boundary and one millisecond before it", async () => {
    const db = database([row("guest")]);
    const before = await getRetentionPreview(db.client, { now: new Date("2026-10-31T07:59:59.999Z"), noticeAt: new Date("2026-10-01T08:00:00Z") });
    expect(before.noticeStatus).toBe("legacy_grace_pending");
    expect(before.groups.guest.legacyExpiredAwaitingGrace).toBe(2);
    expect(before.groups.guest.postNoticeExpired).toBe(1);
    const at = await getRetentionPreview(db.client, { now, noticeAt: new Date("2026-10-01T08:00:00Z") });
    expect(at.noticeStatus).toBe("legacy_grace_elapsed");
    expect(at.groups.guest.legacyExpiredAwaitingGrace).toBe(0);
    expect(at.legacyGraceEndsAt).toBe(now.toISOString());
    expect(db.query.mock.calls[0][0].values).toContain(false);
    expect(db.query.mock.calls[1][0].values).toContain(true);
  });

  it("performs a single parameterized aggregate with fixed USER-time and ownership rules", async () => {
    const db = database();
    await getRetentionPreview(db.client, { now });
    expect(db.query).toHaveBeenCalledTimes(1);
    const sql = db.query.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("MAX(m.created_at)");
    expect(sql.sql).toContain("m.role = 'user'");
    expect(sql.sql).toContain("s.guest_id IS NULL");
    expect(sql.sql).toContain("s.user_id IS NULL");
    expect(sql.sql).toContain("session_created_at <= ?");
    expect(sql.sql).not.toMatch(/\b(content|title|updated_at|DELETE|UPDATE|INSERT|DROP)\b/i);
    expect(sql.values).toContainEqual(new Date("2026-05-04T08:00:00Z"));
    expect(sql.values).toContainEqual(new Date("2026-10-01T08:00:00Z"));
  });

  it("returns observed zeros for an empty database but preserves unknown grace and owner policy", async () => {
    const report = await getRetentionPreview(database().client, { now });
    expect(report.groups.employee.sessions).toBe(0);
    expect(report.groups.employee.expiredUnderNormalPolicy).toBe(0);
    expect(report.groups.employee.passesTimeConditions).toBeNull();
    expect(report.groups.unknown.expiredUnderNormalPolicy).toBeNull();
  });

  it.each([new Date("invalid"), new Date("2026-11-01T00:00:00Z")])("rejects invalid notice input before any database read", async noticeAt => {
    const db = database();
    await expect(getRetentionPreview(db.client, { now, noticeAt })).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("propagates query failure rather than presenting missing data as zero", async () => {
    const db = database();
    db.query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(getRetentionPreview(db.client, { now })).rejects.toThrow("database unavailable");
  });

  it("refuses unsupported owner buckets and unsafe counters", async () => {
    await expect(getRetentionPreview(database([row("unexpected")]).client, { now })).rejects.toThrow("Invalid retention actor aggregate");
    await expect(getRetentionPreview(database([row("employee", { sessions: Number.MAX_SAFE_INTEGER + 1 })]).client, { now })).rejects.toThrow("Invalid retention aggregate");
  });
});

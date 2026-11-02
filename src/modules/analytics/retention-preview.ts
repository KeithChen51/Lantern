import { Prisma, type PrismaClient } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = { employee: 180, guest: 30 } as const;
const GRACE_DAYS = 30;
type Actor = keyof typeof RETENTION_DAYS | "unknown";

export type RetentionPreviewOptions = { now?: Date; noticeAt?: Date };
export type RetentionPreviewCounts = {
  sessions: number;
  withoutUserMessage: number;
  futureUserMessage: number;
  expiredUnderNormalPolicy: number | null;
  legacyExpiredAwaitingGrace: number | null;
  postNoticeExpired: number | null;
  passesTimeConditions: number | null;
};
type AggregateRow = {
  actor: Actor;
  sessions: bigint | number;
  without_user_message: bigint | number;
  future_user_message: bigint | number;
  normal_expired: bigint | number;
  legacy_expired: bigint | number;
  post_notice_expired: bigint | number;
  time_conditions_met: bigint | number;
};

function validNow(now: Date): void {
  if (!Number.isFinite(now.getTime()) || now.getUTCFullYear() < 1000 || now.getUTCFullYear() > 9999) {
    throw new Error("Invalid preview time");
  }
}

/** An actual notice instant is required; a date without a timezone is ambiguous. */
export function parseRetentionPreviewArgs(args: string[], now = new Date()): RetentionPreviewOptions {
  validNow(now);
  if (args.length === 0) return { now };
  if (args.length !== 2 || args[0] !== "--notice-at") throw new Error("Invalid retention preview arguments");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(args[1]);
  if (!match) throw new Error("Notice time must include an explicit ISO timezone");
  const [, year, month, day, hour, minute, second, zone] = match;
  const calendar = new Date(Date.UTC(+year, +month - 1, +day));
  const offsetHours = zone === "Z" ? 0 : +zone.slice(1, 3);
  const offsetMinutes = zone === "Z" ? 0 : +zone.slice(4, 6);
  if (+year < 1000 || calendar.getUTCFullYear() !== +year || calendar.getUTCMonth() !== +month - 1 || calendar.getUTCDate() !== +day ||
      +hour > 23 || +minute > 59 || +second > 59 || offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) {
    throw new Error("Invalid notice time");
  }
  const noticeAt = new Date(args[1]);
  if (!Number.isFinite(noticeAt.getTime()) || noticeAt > now) throw new Error("Notice time must be an actual past or present instant");
  return { now, noticeAt };
}

function count(value: bigint | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid retention aggregate");
  return parsed;
}

/** Only aggregate counts leave MySQL. USER.created_at is first persistence time,
 * not proof of the original send time when old client history was backfilled. */
export async function getRetentionPreview(database: Pick<PrismaClient, "$queryRaw">, options: RetentionPreviewOptions = {}) {
  const now = options.now ?? new Date();
  validNow(now);
  const noticeAt = options.noticeAt ?? null;
  if (noticeAt && (!Number.isFinite(noticeAt.getTime()) || noticeAt.getUTCFullYear() < 1000 || noticeAt > now)) {
    throw new Error("Notice time must be an actual past or present instant");
  }
  const employeeCutoff = new Date(now.getTime() - RETENTION_DAYS.employee * DAY_MS);
  const guestCutoff = new Date(now.getTime() - RETENTION_DAYS.guest * DAY_MS);
  const graceComplete = noticeAt !== null && now.getTime() >= noticeAt.getTime() + GRACE_DAYS * DAY_MS;
  const rows = await database.$queryRaw<AggregateRow[]>(Prisma.sql`
    SELECT actor,
      COUNT(*) AS sessions,
      CAST(SUM(last_user_saved_at IS NULL) AS UNSIGNED) AS without_user_message,
      CAST(SUM(COALESCE(last_user_saved_at > ${now}, FALSE)) AS UNSIGNED) AS future_user_message,
      CAST(SUM(COALESCE(last_user_saved_at <= normal_cutoff, FALSE)) AS UNSIGNED) AS normal_expired,
      CAST(SUM(COALESCE(last_user_saved_at <= normal_cutoff, FALSE)
        AND (${noticeAt} IS NULL OR session_created_at <= ${noticeAt})) AS UNSIGNED) AS legacy_expired,
      CAST(SUM(COALESCE(last_user_saved_at <= normal_cutoff, FALSE)
        AND ${noticeAt} IS NOT NULL AND session_created_at > ${noticeAt}) AS UNSIGNED) AS post_notice_expired,
      CAST(SUM(COALESCE(last_user_saved_at <= normal_cutoff, FALSE)
        AND ${noticeAt} IS NOT NULL AND (session_created_at > ${noticeAt} OR ${graceComplete})) AS UNSIGNED) AS time_conditions_met
    FROM (
      SELECT facts.*, CASE actor WHEN 'employee' THEN ${employeeCutoff}
        WHEN 'guest' THEN ${guestCutoff} ELSE NULL END AS normal_cutoff
      FROM (
        SELECT CASE
          WHEN s.user_id IS NOT NULL AND TRIM(s.user_id) <> '' AND s.guest_id IS NULL THEN 'employee'
          WHEN s.guest_id IS NOT NULL AND TRIM(s.guest_id) <> '' AND s.user_id IS NULL THEN 'guest'
          ELSE 'unknown' END AS actor,
          s.created_at AS session_created_at,
          MAX(m.created_at) AS last_user_saved_at
        FROM chat_sessions s
        LEFT JOIN chat_messages m ON m.session_id = s.id AND m.role = 'user'
        GROUP BY s.id, s.user_id, s.guest_id, s.created_at
      ) facts
    ) classified
    GROUP BY actor
  `);
  const empty = (): RetentionPreviewCounts => ({ sessions: 0, withoutUserMessage: 0, futureUserMessage: 0,
    expiredUnderNormalPolicy: 0, legacyExpiredAwaitingGrace: noticeAt ? 0 : null,
    postNoticeExpired: noticeAt ? 0 : null, passesTimeConditions: noticeAt ? 0 : null });
  const groups: Record<Actor, RetentionPreviewCounts> = { employee: empty(), guest: empty(), unknown: empty() };
  groups.unknown.expiredUnderNormalPolicy = null;
  groups.unknown.legacyExpiredAwaitingGrace = null;
  groups.unknown.postNoticeExpired = null;
  groups.unknown.passesTimeConditions = null;
  for (const row of rows) {
    if (!Object.hasOwn(groups, row.actor)) throw new Error("Invalid retention actor aggregate");
    const group = groups[row.actor];
    group.sessions = count(row.sessions);
    group.withoutUserMessage = count(row.without_user_message);
    group.futureUserMessage = count(row.future_user_message);
    if (row.actor !== "unknown") {
      group.expiredUnderNormalPolicy = count(row.normal_expired);
      group.legacyExpiredAwaitingGrace = noticeAt ? (graceComplete ? 0 : count(row.legacy_expired)) : null;
      group.postNoticeExpired = noticeAt ? count(row.post_notice_expired) : null;
      group.passesTimeConditions = noticeAt ? count(row.time_conditions_met) : null;
    }
  }
  return {
    mode: "preview" as const,
    asOf: now.toISOString(),
    noticeAt: noticeAt?.toISOString() ?? null,
    legacyGraceEndsAt: noticeAt ? new Date(noticeAt.getTime() + GRACE_DAYS * DAY_MS).toISOString() : null,
    retentionDays: { ...RETENTION_DAYS, legacyGrace: GRACE_DAYS },
    timeBasis: "MAX(USER.created_at): first saved time; backfilled history can differ from original send time",
    noticeStatus: noticeAt ? (graceComplete ? "legacy_grace_elapsed" : "legacy_grace_pending") : "notice_not_recorded",
    groups,
    note: "Read-only inventory. Passing time conditions does not authorize deletion; holds, notices, provenance and restore safeguards require separate verification.",
  };
}

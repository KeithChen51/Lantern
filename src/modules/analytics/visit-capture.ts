import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { AccessError, type Principal } from "@/modules/auth/access-types";
import { VISIT_MODULES, type VisitModule } from "./visit-modules";

export type VisitInput = { v: 1; eventId: string; module: VisitModule; csrfToken: string };
type Transaction = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;
type VisitDatabase = { $transaction<T>(action: (tx: Transaction) => Promise<T>): Promise<T> };

export function parseVisitInput(value: unknown): VisitInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccessError("访问记录格式无效。", 400);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "csrfToken,eventId,module,v" ||
      input.v !== 1 || typeof input.eventId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.eventId) ||
      typeof input.module !== "string" || !Object.hasOwn(VISIT_MODULES, input.module) ||
      typeof input.csrfToken !== "string" || !/^[A-Za-z0-9_-]{32,160}$/.test(input.csrfToken)) {
    throw new AccessError("访问记录格式无效。", 400);
  }
  return { ...input, eventId: input.eventId.toLowerCase() } as VisitInput;
}

async function limit(tx: Transaction, key: string, maximum: number, now: Date) {
  const minute = Math.floor(now.getTime() / 60_000);
  const id = `visit-rate:${createHash("sha256").update(key).digest("hex")}`;
  const expires = new Date((minute + 2) * 60_000);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO access_records (id, kind, subjectId, parentId, payload, expiresAt, createdAt, updatedAt)
    VALUES (${id}, 'bucket', 'analytics-visits', NULL, JSON_OBJECT('minute', ${minute}, 'count', 1), ${expires}, ${now}, ${now})
    ON DUPLICATE KEY UPDATE payload = JSON_OBJECT('minute', ${minute}, 'count',
      IF(JSON_EXTRACT(payload, '$.minute') = ${minute}, CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.count')) AS UNSIGNED) + 1, 1)),
      expiresAt = VALUES(expiresAt), updatedAt = VALUES(updatedAt)
  `);
  const rows = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.count')) AS UNSIGNED) AS count
    FROM access_records WHERE id = ${id}
  `);
  const count = Number(rows[0]?.count);
  if (rows.length !== 1 || !Number.isSafeInteger(count) || count < 1 || count > maximum) throw new AccessError("访问记录提交过于频繁。", 429);
}

/** A browser report is a low-trust interaction, not evidence for security decisions. */
export async function captureVisit(principal: Principal, input: VisitInput, now = new Date(), database: VisitDatabase = prisma) {
  if (principal.channel !== "web" || !principal.userId || principal.userId.length > 191) throw new AccessError("需要有效网页身份。", 403);
  const kind = principal.kind === "guest" ? "guest" : "employee";
  const organization = kind === "employee" && typeof principal.organization === "string" && principal.organization.length <= 1000 ? principal.organization : null;
  const day = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  return database.$transaction(async tx => {
    await limit(tx, principal.credentialId, 120, now);
    await limit(tx, "all", 3000, now);
    // The primary key serializes equal event IDs. Only a newly inserted fact may
    // increment the daily total; a duplicate UPDATE never changes its contents.
    const inserted = await tx.$executeRaw(Prisma.sql`
      INSERT IGNORE INTO analytics_page_views (event_id, actor_kind, subject_id, organization, module, occurred_at)
      VALUES (${input.eventId}, ${kind}, ${principal.userId}, ${organization}, ${input.module}, ${now})
    `);
    if (inserted === 0) {
      const existing = await tx.$queryRaw<Array<{ actor_kind: string; subject_id: string; module: string }>>(Prisma.sql`
        SELECT actor_kind, subject_id, module FROM analytics_page_views WHERE event_id = ${input.eventId}
      `);
      if (existing.length !== 1 || existing[0].actor_kind !== kind || existing[0].subject_id !== principal.userId || existing[0].module !== input.module) {
        throw new AccessError("访问记录标识冲突。", 409);
      }
      return { recorded: false };
    }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO analytics_visit_days (day, module, views) VALUES (${day}, ${input.module}, 1)
      ON DUPLICATE KEY UPDATE views = views + 1
    `);
    return { recorded: true };
  });
}

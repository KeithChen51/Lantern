import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { AccessError, type Principal } from "@/modules/auth/access";
import { shanghaiDate } from "@/modules/analytics/report-period";
import { readHermitRecord } from "@/modules/hermit/admin-records-data";

type Database = Pick<PrismaClient, "$executeRaw">;

export function validateHermitRecordId(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 191 ||
      value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new AccessError("会话编号无效。", 400);
  }
  return value;
}

export function validateHermitRecordCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,1600}$/.test(value)) {
    throw new AccessError("会话分页标识无效。", 400);
  }
  return value;
}

/** Commit both the attempt and completion audit before disclosing any content. */
export async function getAuditedHermitRecord(input: {
  principal: Principal;
  id: string;
  cursor?: string;
  recheck: () => Promise<void>;
}, options: {
  database?: Database;
  readRecord?: typeof readHermitRecord;
  now?: Date;
} = {}) {
  const id = validateHermitRecordId(input.id);
  const cursor = validateHermitRecordCursor(input.cursor);
  const database = options.database ?? prisma;
  const now = options.now ?? new Date();
  const auditId = randomUUID();
  const day = shanghaiDate(now);
  const written = await database.$executeRaw(Prisma.sql`
    INSERT INTO analytics_person_audits
      (id, operator_id, approval_ref, purpose, start_day, end_day, status, created_at, session_id)
    VALUES (${auditId}, ${input.principal.userId}, ${"role:platform-admin"}, ${"查看路引对话记录"},
      ${day}, ${day}, 'requested', ${now}, ${id})
  `);
  if (written !== 1) throw new Error("Conversation audit was not recorded");
  try {
    const result = await (options.readRecord ?? readHermitRecord)(id, cursor);
    await input.recheck();
    const completed = await database.$executeRaw(Prisma.sql`
      UPDATE analytics_person_audits SET status = 'completed', result_rows = ${result.messages.length}
      WHERE id = ${auditId} AND status = 'requested'
    `);
    if (completed !== 1) throw new Error("Conversation completion audit was not recorded");
    return result;
  } catch (error) {
    await database.$executeRaw(Prisma.sql`
      UPDATE analytics_person_audits SET status = 'failed' WHERE id = ${auditId} AND status = 'requested'
    `).catch(() => undefined);
    throw error;
  }
}

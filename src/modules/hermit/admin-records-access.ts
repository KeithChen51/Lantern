import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { AccessError, type Principal } from "@/modules/auth/access";
import { shanghaiDate } from "@/modules/analytics/report-period";
import { listHermitRecords, readHermitRecord } from "@/modules/hermit/admin-records-data";

type Database = Pick<PrismaClient, "$executeRaw">;
type AuditOptions = { database?: Database; now?: Date };
type AuditPrincipal = { principal: Principal; recheck: () => Promise<void> };

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

/** Commit both audit states before disclosing employee identities or content. */
async function auditedHermitRead<T extends { rows: unknown[] } | { messages: unknown[] }>(
  input: AuditPrincipal & { id: string | null; action: "查看路引记录列表" | "查看路引对话记录" },
  read: () => Promise<T>,
  options: AuditOptions,
) {
  const database = options.database ?? prisma;
  const now = options.now ?? new Date();
  const auditId = randomUUID();
  const day = shanghaiDate(now);
  const written = await database.$executeRaw(Prisma.sql`
    INSERT INTO analytics_person_audits
      (id, operator_id, approval_ref, purpose, start_day, end_day, status, created_at, session_id)
    VALUES (${auditId}, ${input.principal.userId}, ${"role:platform-admin"}, ${input.action},
      ${day}, ${day}, 'requested', ${now}, ${input.id})
  `);
  if (written !== 1) throw new Error("Conversation audit was not recorded");
  try {
    const result = await read();
    await input.recheck();
    const completed = await database.$executeRaw(Prisma.sql`
      UPDATE analytics_person_audits SET status = 'completed', result_rows = ${"rows" in result ? result.rows.length : result.messages.length}
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

export async function getAuditedHermitRecord(input: AuditPrincipal & {
  id: string;
  cursor?: string;
}, options: AuditOptions & { readRecord?: typeof readHermitRecord } = {}) {
  const id = validateHermitRecordId(input.id);
  const cursor = validateHermitRecordCursor(input.cursor);
  return auditedHermitRead({ ...input, id, action: "查看路引对话记录" },
    () => (options.readRecord ?? readHermitRecord)(id, cursor), options);
}

export async function getAuditedHermitRecords(input: AuditPrincipal & {
  filters: NonNullable<Parameters<typeof listHermitRecords>[0]>;
}, options: AuditOptions & { listRecords?: typeof listHermitRecords } = {}) {
  const id = input.filters.id === undefined ? null : validateHermitRecordId(input.filters.id);
  validateHermitRecordCursor(input.filters.cursor);
  return auditedHermitRead({ ...input, id, action: "查看路引记录列表" },
    () => (options.listRecords ?? listHermitRecords)(input.filters), options);
}

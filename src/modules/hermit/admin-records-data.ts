import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";
import { dateStart } from "@/modules/analytics/report-period";
import { restoreHistoryMessages } from "./history";
import { readRecordIdentities, unavailableRecordIdentity, type HermitRecordIdentity } from "./record-identity";

type Database = Pick<PrismaClient, "$queryRaw">;
type Options = { database?: Database; now?: Date; authority?: "portal" | "iam" | "iam-portal" };
export type HermitRecordActor = "employee" | "guest" | "dealer" | "unknown";
export type HermitRecordFilters = { start?: string; end?: string; actor?: HermitRecordActor; id?: string; cursor?: string };
export type HermitRecordRow = { id: string; actor: HermitRecordActor; createdAt: string; lastQuestionAt: string | null; turns: number; periodTurns?: number; identity: HermitRecordIdentity };
export type HermitRecordsResult = { rows: HermitRecordRow[]; nextCursor: string | null };
export type HermitRecordDetail = { messages: Array<{ id: string; role: "user" | "assistant"; text: string }>; nextCursor: string | null; view?: "stored-attempts" };

const LIST_PAGE_SIZE = 20;
const MESSAGE_PAGE_SIZE = 50;
const MAX_MESSAGE_DESCRIPTORS = 10_000;
const identifier = z.string().min(1).max(191).refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + "T00:00:00.000Z");
  return value >= "1000-01-01" && value < "9999-12-31" && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
});
const filtersSchema = z.object({ start: date.optional(), end: date.optional(), actor: z.enum(["employee", "guest", "dealer", "unknown"]).optional(), id: identifier.optional(), cursor: z.string().optional() }).strict();
const listCursorSchema = z.object({ filter: z.string(), id: identifier, createdAt: z.string().datetime(), lastQuestionAt: z.string().datetime().nullable() }).strict();
const messageCursorSchema = z.union([
  z.object({ session: identifier, after: identifier }).strict(),
  z.object({ session: identifier, mode: z.literal("stored-attempts"), createdAt: z.string().datetime(), id: identifier }).strict(),
]);

function invalid(message: string): never { throw new AppError("bad_request", message, 400); }
function encodeCursor(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor(value: string): unknown {
  if (!value || value.length > 1600 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid("分页标识无效，请重新查询。");
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { return invalid("分页标识无效，请重新查询。"); }
}

type RecordSqlRow = { id: string; actor: HermitRecordActor; createdAt: Date; lastQuestionAt: Date | null; turns: number | bigint; periodTurns?: number | bigint };

function count(value: number | bigint | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid saved conversation count");
  return parsed;
}

/** Inventory reads metadata and bounded employee identity display fields. */
export async function listHermitRecords(input: HermitRecordFilters = {}, options: Options = {}): Promise<HermitRecordsResult> {
  const checked = filtersSchema.safeParse(input);
  if (!checked.success) invalid("请选择有效的筛选条件。");
  const { start, end, actor, id, cursor } = checked.data;
  if (start && end && start > end) invalid("开始日期不能晚于结束日期。");
  const fingerprint = createHash("sha256").update(JSON.stringify([start ?? null, end ?? null, actor ?? null, id ?? null])).digest("hex");
  const periodConditions: Prisma.Sql[] = [];
  if (start) periodConditions.push(Prisma.sql`created_at >= ${dateStart(start)}`);
  if (end) periodConditions.push(Prisma.sql`created_at < ${new Date(+dateStart(end) + 86_400_000)}`);
  const hasPeriod = periodConditions.length > 0;
  const conditions: Prisma.Sql[] = [];
  if (hasPeriod) conditions.push(Prisma.sql`inventory.periodTurns > 0`);
  if (actor) conditions.push(Prisma.sql`inventory.actor = ${actor}`);
  if (cursor !== undefined) {
    const parsed = listCursorSchema.safeParse(decodeCursor(cursor));
    if (!parsed.success || parsed.data.filter !== fingerprint) invalid("分页标识与当前筛选不一致，请重新查询。");
    const boundary = parsed.data;
    const withinTime = Prisma.sql`(inventory.createdAt < ${new Date(boundary.createdAt)} OR
      (inventory.createdAt = ${new Date(boundary.createdAt)} AND BINARY inventory.id < BINARY ${boundary.id}))`;
    conditions.push(boundary.lastQuestionAt === null
      ? Prisma.sql`(inventory.lastQuestionAt IS NULL AND ${withinTime})`
      : Prisma.sql`(inventory.lastQuestionAt IS NULL OR inventory.lastQuestionAt < ${new Date(boundary.lastQuestionAt)} OR
          (inventory.lastQuestionAt = ${new Date(boundary.lastQuestionAt)} AND ${withinTime}))`);
  }
  const rows = await (options.database ?? prisma).$queryRaw<RecordSqlRow[]>(Prisma.sql`
    SELECT inventory.id, inventory.actor, inventory.createdAt, inventory.lastQuestionAt, inventory.turns
      ${hasPeriod ? Prisma.sql`, inventory.periodTurns` : Prisma.empty}
    FROM (
      SELECT s.id, s.created_at AS createdAt,
        CASE WHEN s.user_id IS NOT NULL AND s.guest_id IS NULL AND u.user_type = 'internal_employee' THEN 'employee'
          WHEN s.user_id IS NOT NULL AND s.guest_id IS NULL AND u.user_type = 'dealer_user' THEN 'dealer'
          WHEN s.guest_id IS NOT NULL AND s.user_id IS NULL THEN 'guest' ELSE 'unknown' END AS actor,
        question.lastQuestionAt, COALESCE(question.turns, 0) AS turns
        ${hasPeriod ? Prisma.sql`, question.periodTurns` : Prisma.empty}
      FROM chat_sessions s LEFT JOIN (
        SELECT session_id, MAX(created_at) AS lastQuestionAt, COUNT(*) AS turns
          ${hasPeriod ? Prisma.sql`, COUNT(CASE WHEN ${Prisma.join(periodConditions, " AND ")} THEN 1 END) AS periodTurns` : Prisma.empty}
        FROM chat_messages WHERE role = 'user'
          ${id ? Prisma.sql`AND session_id = ${id}` : Prisma.empty}
        GROUP BY session_id
      ) question ON question.session_id = s.id
      LEFT JOIN users u ON u.id = s.user_id
      ${id ? Prisma.sql`WHERE s.id = ${id} AND BINARY s.id = BINARY ${id}` : Prisma.empty}
    ) inventory
    ${conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty}
    ORDER BY inventory.lastQuestionAt IS NULL ASC, inventory.lastQuestionAt DESC, inventory.createdAt DESC, BINARY inventory.id DESC
    LIMIT ${LIST_PAGE_SIZE + 1}
  `);
  const selected = rows.slice(0, LIST_PAGE_SIZE);
  const identities = await readRecordIdentities(selected.filter(row => row.actor === "employee").map(row => row.id), { ...options, database: options.database ?? prisma });
  const last = selected.at(-1);
  return {
    rows: selected.map(row => ({ id: row.id, actor: row.actor, createdAt: row.createdAt.toISOString(),
      lastQuestionAt: row.lastQuestionAt?.toISOString() ?? null, turns: count(row.turns),
      identity: row.actor === "employee" ? identities.get(row.id) ?? { ...unavailableRecordIdentity } : { ...unavailableRecordIdentity },
      ...(hasPeriod ? { periodTurns: count(row.periodTurns) } : {}) })),
    nextCursor: rows.length > LIST_PAGE_SIZE && last ? encodeCursor({ filter: fingerprint, id: last.id,
      createdAt: last.createdAt.toISOString(), lastQuestionAt: last.lastQuestionAt?.toISOString() ?? null }) : null,
  };
}

type Descriptor = { id: string; externalMessageId: string; role: string; turn: unknown };
type StoredBoundary = { createdAt: Date; id: string };

async function readStoredAttempts(database: Database, id: string, boundary?: StoredBoundary): Promise<HermitRecordDetail> {
  const rows = await database.$queryRaw<Array<{ id: string; externalMessageId: string; role: string; text: string; createdAt: Date }>>(Prisma.sql`
    SELECT id, external_message_id AS externalMessageId, role, content AS text, created_at AS createdAt
    FROM chat_messages WHERE session_id = ${id} AND role IN ('user', 'assistant')
      ${boundary ? Prisma.sql`AND (created_at > ${boundary.createdAt} OR
        (created_at = ${boundary.createdAt} AND BINARY id > BINARY ${boundary.id}))` : Prisma.empty}
    ORDER BY created_at ASC, BINARY id ASC LIMIT ${MESSAGE_PAGE_SIZE + 1}
  `);
  const selected = rows.slice(0, MESSAGE_PAGE_SIZE);
  const last = selected.at(-1);
  return {
    messages: selected.map(row => ({ id: row.externalMessageId, role: row.role.toLowerCase() as "user" | "assistant", text: row.text })),
    nextCursor: rows.length > MESSAGE_PAGE_SIZE && last ? encodeCursor({ session: id, mode: "stored-attempts", createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    view: "stored-attempts",
  };
}

/** Called only inside the administrator's audited, separately authorized read. */
export async function readHermitRecord(id: string, cursor?: string, options: Options = {}): Promise<HermitRecordDetail> {
  if (!identifier.safeParse(id).success) invalid("会话编号无效。");
  let after: string | undefined;
  let storedBoundary: StoredBoundary | undefined;
  if (cursor !== undefined) {
    const parsed = messageCursorSchema.safeParse(decodeCursor(cursor));
    if (!parsed.success || parsed.data.session !== id) invalid("分页标识与当前会话不一致。");
    if ("mode" in parsed.data) storedBoundary = { id: parsed.data.id, createdAt: new Date(parsed.data.createdAt) };
    else after = parsed.data.after;
  }
  const database = options.database ?? prisma;
  const exists = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM chat_sessions WHERE id = ${id} AND BINARY id = BINARY ${id} LIMIT 1`);
  if (!exists.length) throw new AppError("not_found", "该会话已不存在。", 404);
  if (storedBoundary) {
    // Cursor fields are client-controlled. Only the current saved length can
    // authorize the alternate view that also includes superseded attempts.
    const oversized = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM chat_messages WHERE session_id = ${id} AND role IN ('user', 'assistant')
      LIMIT 1 OFFSET ${MAX_MESSAGE_DESCRIPTORS}
    `);
    if (!oversized.length) invalid("会话记录已变化，请重新打开。");
    return readStoredAttempts(database, id, storedBoundary);
  }
  // Retry answers can finish after later turns. Resolve their safe descriptors
  // together before paging so page boundaries cannot show an obsolete attempt.
  const descriptors = await database.$queryRaw<Descriptor[]>(Prisma.sql`
    SELECT id, external_message_id AS externalMessageId, role,
      JSON_EXTRACT(metadata_json, '$.hermitTurn') AS turn
    FROM chat_messages WHERE session_id = ${id} AND role IN ('user', 'assistant')
    ORDER BY created_at ASC, BINARY id ASC LIMIT ${MAX_MESSAGE_DESCRIPTORS + 1}
  `);
  if (descriptors.length > MAX_MESSAGE_DESCRIPTORS) {
    if (after !== undefined) invalid("会话记录已变化，请重新打开。");
    return readStoredAttempts(database, id);
  }
  const restored = restoreHistoryMessages(descriptors.map(row => {
    let turn = row.turn;
    if (typeof turn === "string") { try { turn = JSON.parse(turn); } catch { turn = null; } }
    return { ...row, content: "", metadataJson: { hermitTurn: turn ?? undefined } };
  })).messages;
  const anchor = after === undefined ? -1 : restored.findIndex(message => message.id === after);
  if (after !== undefined && anchor < 0) invalid("会话记录已变化，请重新打开。");
  const selected = restored.slice(anchor + 1, anchor + 1 + MESSAGE_PAGE_SIZE);
  const content = selected.length ? await database.$queryRaw<Array<{ externalMessageId: string; text: string }>>(Prisma.sql`
    SELECT external_message_id AS externalMessageId, content AS text FROM chat_messages
    WHERE session_id = ${id} AND external_message_id IN (${Prisma.join(selected.map(message => message.id))})
      AND role IN ('user', 'assistant')
  `) : [];
  const text = new Map(content.map(row => [row.externalMessageId, row.text]));
  if (selected.some(message => !text.has(message.id))) throw new AppError("not_found", "会话记录已变化，请重新打开。", 404);
  return {
    messages: selected.map(message => ({ id: message.id, role: message.role as "user" | "assistant", text: text.get(message.id)! })),
    nextCursor: anchor + 1 + selected.length < restored.length ? encodeCursor({ session: id, after: selected.at(-1)!.id }) : null,
  };
}

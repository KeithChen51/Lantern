import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import type { Principal } from "@/modules/auth/access";
import { reportBounds, type ReportPeriod } from "./report-period";
import { visitDetailWindow } from "./report";

type Database = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;
type EmployeeCount = { employeeId: string; displayName: string; discriminator: string; visits?: bigint | number; conversations?: bigint | number; turns?: bigint | number };
export type EmployeeVisitRank = { rank: number; employee: string; visits: number };
export type EmployeeAiRank = { rank: number; employee: string; conversations: number; turns: number };
export type EmployeeRankingResult = {
  period: { startDate: string; endDate: string };
  visits: { rows: EmployeeVisitRank[]; note: string };
  ai: { rows: EmployeeAiRank[]; note: string };
  generatedAt: string;
};

function count(value: bigint | number | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid employee ranking count");
  return parsed;
}

function labels(rows: EmployeeCount[]): Map<string, string> {
  const unique = new Map(rows.map(row => [row.employeeId, row] as const).sort(([left], [right]) => left.localeCompare(right)));
  const names = new Map<string, number>();
  const discriminators = new Map<string, number>();
  for (const row of unique.values()) names.set(row.displayName, (names.get(row.displayName) ?? 0) + 1);
  for (const row of unique.values()) {
    const key = `${row.displayName}:${row.discriminator}`;
    discriminators.set(key, (discriminators.get(key) ?? 0) + 1);
  }
  return new Map([...unique.values()].map((row, index) => {
    const discriminator = discriminators.get(`${row.displayName}:${row.discriminator}`)! > 1 ? `${row.discriminator}-${index + 1}` : row.discriminator;
    return [row.employeeId, names.get(row.displayName)! > 1 ? `${row.displayName} · ${discriminator}` : row.displayName];
  }));
}

export function validateEmployeeRankingPurpose(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 4 || value.trim().length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Invalid employee ranking purpose");
  }
  return value.trim();
}

/** An audit must commit both before reading and before disclosing named results. */
export async function getAuditedEmployeeRankings(input: {
  principal: Principal;
  approvalRef: string;
  purpose: string;
  period: ReportPeriod;
  recheck: () => Promise<void>;
}, options: { database?: Database; now?: Date } = {}): Promise<EmployeeRankingResult> {
  const database = options.database ?? prisma;
  const now = options.now ?? new Date();
  const bounds = reportBounds(input.period, now);
  const detail = visitDetailWindow(input.period, now);
  const aiStart = new Date(Math.max(bounds.start.getTime(), now.getTime() - 180 * 86_400_000));
  const purpose = validateEmployeeRankingPurpose(input.purpose);
  const auditId = randomUUID();
  const auditWritten = await database.$executeRaw(Prisma.sql`
    INSERT INTO analytics_person_audits
      (id, operator_id, approval_ref, purpose, start_day, end_day, status, created_at)
    VALUES (${auditId}, ${input.principal.userId}, ${input.approvalRef}, ${purpose},
      ${input.period.startDate}, ${input.period.endDate}, 'requested', ${now})
  `);
  if (auditWritten !== 1) throw new Error("Employee ranking audit was not recorded");
  try {
    const visitRows = detail.start ? await database.$queryRaw<EmployeeCount[]>(Prisma.sql`
      SELECT u.id AS employeeId, u.display_name AS displayName,
        COALESCE((SELECT RIGHT(MIN(i.provider_user_id), 4) FROM identity_accounts i
          WHERE i.user_id = u.id AND i.provider = 'lighthouse-portal'), RIGHT(u.id, 6)) AS discriminator,
        totals.visits
      FROM (
        SELECT subject_id, COUNT(*) AS visits FROM analytics_page_views
        WHERE actor_kind = 'employee' AND occurred_at >= ${detail.start} AND occurred_at < ${detail.endExclusive}
        GROUP BY subject_id
      ) totals INNER JOIN users u ON u.id = totals.subject_id
      WHERE u.user_type = 'internal_employee'
      ORDER BY totals.visits DESC, u.id ASC LIMIT 10
    `) : [];
    const aiRows = aiStart < bounds.endExclusive ? await database.$queryRaw<EmployeeCount[]>(Prisma.sql`
      SELECT u.id AS employeeId, u.display_name AS displayName,
        COALESCE((SELECT RIGHT(MIN(i.provider_user_id), 4) FROM identity_accounts i
          WHERE i.user_id = u.id AND i.provider = 'lighthouse-portal'), RIGHT(u.id, 6)) AS discriminator,
        totals.conversations, totals.turns
      FROM (
        SELECT s.user_id, COUNT(DISTINCT s.id) AS conversations, COUNT(*) AS turns
        FROM chat_messages m INNER JOIN chat_sessions s ON s.id = m.session_id
        WHERE m.role = 'user' AND s.user_id IS NOT NULL AND s.guest_id IS NULL
          AND m.created_at >= ${aiStart} AND m.created_at < ${bounds.endExclusive}
        GROUP BY s.user_id
      ) totals INNER JOIN users u ON u.id = totals.user_id
      WHERE u.user_type = 'internal_employee'
      ORDER BY totals.conversations DESC, totals.turns DESC, u.id ASC LIMIT 10
    `) : [];
    const employeeLabels = labels([...visitRows, ...aiRows]);
    const result: EmployeeRankingResult = {
      period: { startDate: input.period.startDate, endDate: input.period.endDate },
      visits: {
        rows: visitRows.map((row, index) => ({ rank: index + 1, employee: employeeLabels.get(row.employeeId)!, visits: count(row.visits) })),
        note: detail.coverage.note,
      },
      ai: {
        rows: aiRows.map((row, index) => ({ rank: index + 1, employee: employeeLabels.get(row.employeeId)!, conversations: count(row.conversations), turns: count(row.turns) })),
        note: `按已保存用户消息统计会话和轮次，同一会话在所选期间多次发言仍计 1 段。${aiStart > bounds.start ? "较早记录已超出 180 天明细窗口，榜单仅覆盖可查期间。" : ""}`,
      },
      generatedAt: now.toISOString(),
    };
    await input.recheck();
    const completed = await database.$executeRaw(Prisma.sql`
      UPDATE analytics_person_audits SET status = 'completed', result_rows = ${visitRows.length + aiRows.length}
      WHERE id = ${auditId} AND status = 'requested'
    `);
    if (completed !== 1) throw new Error("Employee ranking completion audit was not recorded");
    return result;
  } catch (error) {
    await database.$executeRaw(Prisma.sql`UPDATE analytics_person_audits SET status = 'failed' WHERE id = ${auditId} AND status = 'requested'`).catch(() => undefined);
    throw error;
  }
}


import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { visitCoverageStart } from "./policy";
import { dateStart, reportBounds, shanghaiDate, type ReportPeriod } from "./report-period";

export type ReportStatus = "available" | "partial" | "not_collected" | "unavailable";
export type ReportCoverage = { status: ReportStatus; note: string; observedFrom: string | null };
export type HeatmapDay = { date: string; views: number | null; status: ReportStatus };
export type UsageReport = {
  period: ReportPeriod;
  generatedAt: string;
  heatmap: ReportCoverage & { startDate: string; endDate: string; days: HeatmapDay[] };
  visits: ReportCoverage & { total: number | null; modules: Array<{ module: string; label: string; views: number }>; coverageStart: string | null };
  visitors: ReportCoverage & { employees: number | null; guests: number | null };
  ai: ReportCoverage & { conversations: number | null; rounds: number | null };
  departments: ReportCoverage & { items: Array<{ department: string; views: number }>; unknownOrganizationVisits: number | null };
};
type ReportQuery = (query: Prisma.Sql) => Promise<unknown[]>;
type Options = { now?: Date; coverageStart?: Date | null; query?: ReportQuery };
const DAY = 86_400_000;
const RETENTION_DAYS = 180;
const MODULE_LABELS: Record<string, string> = {
  heart: "本心", mirror: "镜鉴", action: "笃行", games: "启航",
  hermit: "路引", search: "搜索", me: "我的", updates: "版本消息",
};

function safeCount(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "bigint") throw new Error("Invalid report count");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Invalid report count");
  return result;
}
function rowsOf<T>(rows: unknown[]): T[] {
  if (!Array.isArray(rows)) throw new Error("Invalid report result");
  return rows as T[];
}
function one<T>(rows: unknown[]): T {
  if (rows.length !== 1) throw new Error("Invalid report aggregate");
  return rows[0] as T;
}
function coverage(start: Date, end: Date, collectedAt: Date | null): ReportCoverage {
  if (!collectedAt || collectedAt >= end) return { status: "not_collected", observedFrom: null, note: "所选时间尚无页面访问采集覆盖。" };
  const observedFrom = new Date(Math.max(start.getTime(), collectedAt.getTime())).toISOString();
  return {
    status: collectedAt > start ? "partial" : "available",
    observedFrom,
    note: collectedAt > start ? "仅包含采集开始后的记录，请按实际覆盖时间查看。" : "",
  };
}
function failed(): ReportCoverage {
  return { status: "unavailable", observedFrom: null, note: "本次数据读取失败，请稍后重新加载。" };
}

export function visitDetailWindow(period: ReportPeriod, now = new Date(), collectedAt: Date | null = visitCoverageStart(now)): {
  start: Date | null; endExclusive: Date; coverage: ReportCoverage;
} {
  const bounds = reportBounds(period, now);
  const start = collectedAt ? new Date(Math.max(bounds.start.getTime(), collectedAt.getTime(), now.getTime() - RETENTION_DAYS * DAY)) : null;
  const info = coverage(bounds.start, bounds.endExclusive, start);
  if (info.status === "partial") info.note = "按可查询的访问明细去重，仅覆盖采集起点及最近 180 天内的记录。";
  if (info.status === "not_collected") info.note = "所选时间不在访问明细的可查询范围内，需位于采集起点之后及最近 180 天内。";
  return { start: info.status === "not_collected" ? null : start, endExclusive: bounds.endExclusive, coverage: info };
}

/** All personal identifiers remain inside aggregate SQL. Individual rankings have a separate audited entry point. */
export async function getUsageReport(period: ReportPeriod, options: Options = {}): Promise<UsageReport> {
  const now = options.now ?? new Date();
  const { start, endExclusive } = reportBounds(period, now);
  const query: ReportQuery = options.query ?? (sql => prisma.$queryRaw<unknown[]>(sql));
  const collectedAt = options.coverageStart === undefined ? visitCoverageStart(now) : options.coverageStart;
  if (collectedAt && (!Number.isFinite(collectedAt.getTime()) || collectedAt > now)) throw new RangeError("访问采集时间无效。");
  const today = shanghaiDate(now);
  const heatStart = new Date(dateStart(today).getTime() - 364 * DAY);
  const heatStartDate = shanghaiDate(heatStart);
  const visitCoverage = coverage(start, endExclusive, collectedAt);
  const detailWindow = visitDetailWindow(period, now, collectedAt);
  const detailStart = detailWindow.start;
  const detailCoverage = detailWindow.coverage;
  const heatCoverage = coverage(heatStart, now, collectedAt);
  const days: HeatmapDay[] = Array.from({ length: 365 }, (_, index) => {
    const day = new Date(heatStart.getTime() + index * DAY);
    const info = coverage(day, new Date(Math.min(day.getTime() + DAY, now.getTime())), collectedAt);
    return { date: shanghaiDate(day), views: info.status === "not_collected" ? null : 0, status: info.status };
  });

  const visits = async (): Promise<UsageReport["visits"]> => {
    const empty = { ...visitCoverage, total: null, modules: [], coverageStart: collectedAt?.toISOString() ?? null };
    if (visitCoverage.status === "not_collected") return empty;
    try {
      const rows = rowsOf<{ module: string; views: unknown }>(await query(Prisma.sql`
        SELECT module, CAST(SUM(views) AS UNSIGNED) AS views FROM analytics_visit_days
        WHERE day >= ${collectedAt && shanghaiDate(collectedAt) > period.startDate ? shanghaiDate(collectedAt) : period.startDate} AND day <= ${period.endDate} GROUP BY module
      `));
      const modules = rows.map(row => {
        if (!Object.hasOwn(MODULE_LABELS, row.module)) throw new Error("Unknown report module");
        return { module: row.module, label: MODULE_LABELS[row.module], views: safeCount(row.views) };
      }).sort((a, b) => b.views - a.views || a.module.localeCompare(b.module, "en"));
      const total = safeCount(modules.reduce((sum, item) => sum + item.views, 0));
      return { ...empty, total, modules };
    } catch { return { ...empty, ...failed() }; }
  };
  const visitors = async (): Promise<UsageReport["visitors"]> => {
    const empty = { ...detailCoverage, employees: null, guests: null };
    if (!detailStart || detailCoverage.status === "not_collected") return empty;
    try {
      const counts = one<{ employees: unknown; guests: unknown }>(await query(Prisma.sql`
        SELECT COUNT(DISTINCT CASE WHEN actor_kind = 'employee' THEN subject_id END) AS employees,
          COUNT(DISTINCT CASE WHEN actor_kind = 'guest' THEN subject_id END) AS guests
        FROM analytics_page_views WHERE occurred_at >= ${detailStart} AND occurred_at < ${endExclusive}
      `));
      return { ...empty, employees: safeCount(counts.employees), guests: safeCount(counts.guests),
        note: [empty.note, "员工按账号去重，访客按匿名标识去重；标识重建后可能重复计入。"].filter(Boolean).join(" ") };
    } catch { return { ...empty, ...failed() }; }
  };
  const heatmap = async (): Promise<UsageReport["heatmap"]> => {
    const empty = { ...heatCoverage, startDate: heatStartDate, endDate: today, days };
    if (heatCoverage.status === "not_collected") return empty;
    try {
      const rows = rowsOf<{ day: string; views: unknown }>(await query(Prisma.sql`
        SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, CAST(SUM(views) AS UNSIGNED) AS views
        FROM analytics_visit_days WHERE day >= ${heatStartDate} AND day <= ${today} GROUP BY day
      `));
      const totals = new Map(rows.map(row => [row.day, safeCount(row.views)]));
      return { ...empty, days: days.map(day => day.views === null ? day : { ...day, views: totals.get(day.date) ?? 0 }) };
    } catch { return { ...empty, ...failed(), days: days.map(day => ({ ...day, views: null, status: "unavailable" as const })) }; }
  };
  const ai = async (): Promise<UsageReport["ai"]> => {
    try {
      const counts = one<{ conversations: unknown; rounds: unknown }>(await query(Prisma.sql`
        SELECT COUNT(DISTINCT session_id) AS conversations, COUNT(*) AS rounds FROM chat_messages
        WHERE role = 'user' AND created_at >= ${start} AND created_at < ${endExclusive}
      `));
      return {
        status: "available", observedFrom: start.toISOString(),
        conversations: safeCount(counts.conversations), rounds: safeCount(counts.rounds),
        note: "统计所选时间内已保存的用户消息。每条用户消息计 1 轮，有用户消息的会话计 1 次；历史补传与内容清理会影响覆盖。",
      };
    } catch { return { ...failed(), conversations: null, rounds: null }; }
  };
  const departments = async (): Promise<UsageReport["departments"]> => {
    const empty = { ...detailCoverage, items: [], unknownOrganizationVisits: null };
    if (!detailStart || detailCoverage.status === "not_collected") return empty;
    try {
      const [rankingRows, missingRows] = await Promise.all([query(Prisma.sql`
        SELECT organization AS department, COUNT(*) AS views FROM analytics_page_views
        WHERE actor_kind = 'employee' AND occurred_at >= ${detailStart} AND occurred_at < ${endExclusive}
          AND organization IS NOT NULL AND TRIM(organization) <> ''
        GROUP BY organization HAVING COUNT(DISTINCT subject_id) >= 5
        ORDER BY views DESC, organization ASC LIMIT 10
      `), query(Prisma.sql`
        SELECT COUNT(*) AS missing FROM analytics_page_views
        WHERE actor_kind = 'employee' AND occurred_at >= ${detailStart} AND occurred_at < ${endExclusive}
          AND (organization IS NULL OR TRIM(organization) = '')
      `)]);
      const rows = rowsOf<{ department: string; views: unknown }>(rankingRows);
      const missing = one<{ missing: unknown }>(missingRows);
      const items = rows.map(row => {
        if (typeof row.department !== "string" || !row.department.trim() || row.department.length > 1000) throw new Error("Invalid department aggregate");
        return { department: row.department, views: safeCount(row.views) };
      });
      return { ...empty, items, unknownOrganizationVisits: safeCount(missing.missing), note: [empty.note, "按访问发生时身份源提供的组织归属统计；未提供组织和不足 5 名访问员工的组织不进入榜单。"].filter(Boolean).join(" ") };
    } catch { return { ...empty, ...failed() }; }
  };
  const [heatmapData, visitsData, visitorsData, aiData, departmentData] = await Promise.all([heatmap(), visits(), visitors(), ai(), departments()]);
  return { period, generatedAt: now.toISOString(), heatmap: heatmapData, visits: visitsData, visitors: visitorsData, ai: aiData, departments: departmentData };
}


import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import { visitCoverageStart } from "./policy";
import { dateStart, shanghaiDate } from "./report-period";
import type { ReportStatus } from "./report";

export type VisitTrendRange = "7" | "30" | "all";
export type VisitTrendDay = {
  date: string;
  pv: number | null;
  uv: number | null;
  pvStatus: ReportStatus;
  uvStatus: ReportStatus;
};
export type VisitTrend = {
  range: VisitTrendRange;
  startDate: string | null;
  endDate: string;
  days: VisitTrendDay[];
};
type Query = (sql: Prisma.Sql) => Promise<unknown[]>;
type Options = { now?: Date; coverageStart?: Date | null; query?: Query };
const DAY = 86_400_000;

export function parseVisitTrendRange(params: URLSearchParams): VisitTrendRange {
  for (const key of params.keys()) {
    if (key !== "range" || params.getAll(key).length !== 1) throw new RangeError("访问趋势时间参数无效。");
  }
  const range = params.get("range") ?? "7";
  if (range !== "7" && range !== "30" && range !== "all") throw new RangeError("请选择最近 7 天、最近 30 天或全部。");
  return range;
}

function calendarDate(value: Date): string { return value.toISOString().slice(0, 10); }
function twoYearsLater(value: Date): Date {
  const year = value.getUTCFullYear() + 2;
  const month = value.getUTCMonth();
  const day = Math.min(value.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day));
}

/** Matches daily summary expiry: (day + 1 day) + 24 calendar months <= today. */
export function oldestTrendDate(today: string): string {
  const current = new Date(today + "T00:00:00Z");
  const year = current.getUTCFullYear() - 2;
  const month = current.getUTCMonth();
  const day = Math.min(current.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  let oldest = new Date(Date.UTC(year, month, day));
  while (twoYearsLater(new Date(+oldest + DAY)) <= current) oldest = new Date(+oldest + DAY);
  return calendarDate(oldest);
}

function counts(rows: unknown[], key: "views" | "visitors", start: string, end: string): Map<string, number> {
  if (!Array.isArray(rows)) throw new Error("Invalid daily aggregate");
  const result = new Map<string, number>();
  for (const input of rows) {
    if (!input || typeof input !== "object") throw new Error("Invalid daily aggregate");
    const row = input as Record<string, unknown>;
    const day = row.day;
    const value = row[key];
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < start || day > end ||
        !Number.isFinite(new Date(day + "T00:00:00Z").getTime()) || calendarDate(new Date(day + "T00:00:00Z")) !== day ||
        result.has(day) || (typeof value !== "number" && typeof value !== "bigint")) throw new Error("Invalid daily aggregate");
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error("Invalid daily aggregate");
    result.set(day, number);
  }
  return result;
}

/** Identifiers remain inside grouped SQL; only daily counts leave this function. */
export async function getVisitTrend(range: VisitTrendRange, options: Options = {}): Promise<VisitTrend> {
  if (range !== "7" && range !== "30" && range !== "all") throw new RangeError("访问趋势时间参数无效。");
  const now = options.now ?? new Date();
  const today = shanghaiDate(now);
  const collectedAt = options.coverageStart === undefined ? visitCoverageStart(now) : options.coverageStart;
  if (collectedAt && (!Number.isFinite(+collectedAt) || collectedAt > now)) throw new RangeError("访问采集时间无效。");
  const oldest = oldestTrendDate(today);
  const startDate = range === "all"
    ? collectedAt ? [oldest, shanghaiDate(collectedAt)].sort().at(-1)! : null
    : shanghaiDate(new Date(+dateStart(today) - (Number(range) - 1) * DAY));
  const result: VisitTrend = { range, startDate, endDate: today, days: [] };
  if (!startDate) return result;
  for (let day = dateStart(startDate); day <= now; day = new Date(+day + DAY)) {
    const end = Math.min(+day + DAY, +now);
    const status: ReportStatus = !collectedAt || +collectedAt >= end ? "not_collected" : collectedAt > day ? "partial" : "available";
    result.days.push({ date: shanghaiDate(day), pv: null, uv: null, pvStatus: status, uvStatus: status });
  }
  if (!collectedAt || !result.days.some(day => day.pvStatus !== "not_collected")) return result;
  const observedStart = shanghaiDate(new Date(Math.max(+collectedAt, +dateStart(startDate))));
  const cutoff = new Date(+now - 180 * DAY);
  // Cleanup removes occurred_at <= cutoff, including an event exactly on it.
  const liveStart = new Date(Math.max(+collectedAt, +dateStart(startDate), +cutoff + 1));
  const needsArchive = result.days.some(day => day.pvStatus !== "not_collected" && Math.max(+dateStart(day.date), +collectedAt) <= +cutoff);
  const query = options.query ?? (sql => prisma.$queryRaw<unknown[]>(sql));
  const load = async (sql: Prisma.Sql, key: "views" | "visitors") => {
    try { return counts(await query(sql), key, observedStart, today); }
    catch { return null; }
  };
  const [pv, liveUv, savedUv] = await Promise.all([
    load(Prisma.sql`
      SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, CAST(SUM(views) AS UNSIGNED) AS views
      FROM analytics_visit_days WHERE day >= ${observedStart} AND day <= ${today} GROUP BY day
    `, "views"),
    load(Prisma.sql`
      SELECT DATE_FORMAT(DATE_ADD(occurred_at, INTERVAL 8 HOUR), '%Y-%m-%d') AS day,
        COUNT(DISTINCT actor_kind, subject_id) AS visitors
      FROM analytics_page_views WHERE occurred_at >= ${liveStart} AND occurred_at < ${now}
      GROUP BY DATE_FORMAT(DATE_ADD(occurred_at, INTERVAL 8 HOUR), '%Y-%m-%d')
    `, "visitors"),
    needsArchive ? load(Prisma.sql`
      SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, visitors
      FROM analytics_daily_visitors WHERE day >= ${observedStart} AND day <= ${shanghaiDate(cutoff)}
    `, "visitors") : Promise.resolve(new Map<string, number>()),
  ]);
  for (const day of result.days) {
    if (day.pvStatus === "not_collected") continue;
    if (pv) day.pv = pv.get(day.date) ?? 0;
    else day.pvStatus = "unavailable";
    const effectiveStart = Math.max(+dateStart(day.date), +collectedAt);
    if (effectiveStart > +cutoff) {
      if (liveUv) day.uv = liveUv.get(day.date) ?? 0;
      else day.uvStatus = "unavailable";
    } else if (savedUv?.has(day.date)) day.uv = savedUv.get(day.date)!;
    else if (day.pv === 0) day.uv = 0;
    else day.uvStatus = savedUv ? "not_collected" : "unavailable";
  }
  return result;
}

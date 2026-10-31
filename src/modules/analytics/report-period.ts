export type ReportPreset = "week" | "month" | "custom";
export type ReportPeriod = {
  preset: ReportPreset;
  startDate: string;
  endDate: string;
  timeZone: "Asia/Shanghai";
};

const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;

export function shanghaiDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new RangeError("统计时间无效。");
  return new Date(value.getTime() + OFFSET).toISOString().slice(0, 10);
}

export function dateStart(date: string): Date {
  return new Date(date + "T00:00:00+08:00");
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Calendar periods use Shanghai days; a custom end date is inclusive. */
export function parseReportPeriod(params: URLSearchParams, now = new Date()): ReportPeriod {
  const allowed = new Set(["preset", "start", "end"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new RangeError("统计时间参数无效。");
  }
  const preset = params.get("preset") ?? "week";
  if (!["week", "month", "custom"].includes(preset)) throw new RangeError("请选择本周、本月或自定义时间。");
  const today = shanghaiDate(now);
  if (preset !== "custom") {
    if (params.has("start") || params.has("end")) throw new RangeError("起止日期仅用于自定义时间。");
    const local = new Date(today + "T00:00:00.000Z");
    const startDate = preset === "month"
      ? today.slice(0, 8) + "01"
      : new Date(local.getTime() - ((local.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
    return { preset: preset as ReportPreset, startDate, endDate: today, timeZone: "Asia/Shanghai" };
  }
  const startDate = params.get("start") ?? "";
  const endDate = params.get("end") ?? "";
  if (!validDate(startDate) || !validDate(endDate)) throw new RangeError("请选择有效的起止日期。");
  if (startDate > endDate || endDate > today) throw new RangeError("起始日期须早于或等于结束日期，且不能选择未来日期。");
  const current = new Date(today + "T00:00:00.000Z");
  const oldestDay = Math.min(current.getUTCDate(), new Date(Date.UTC(current.getUTCFullYear() - 2, current.getUTCMonth() + 1, 0)).getUTCDate());
  const oldest = new Date(Date.UTC(current.getUTCFullYear() - 2, current.getUTCMonth(), oldestDay)).toISOString().slice(0, 10);
  if (startDate < oldest) throw new RangeError("自定义时间最多查询最近 24 个月。");
  return { preset: "custom", startDate, endDate, timeZone: "Asia/Shanghai" };
}

export function reportBounds(period: ReportPeriod, now = new Date()): { start: Date; endExclusive: Date } {
  const checked = parseReportPeriod(new URLSearchParams({ preset: "custom", start: period.startDate, end: period.endDate }), now);
  const start = dateStart(checked.startDate);
  const followingMidnight = new Date(dateStart(checked.endDate).getTime() + DAY);
  return { start, endExclusive: new Date(Math.min(followingMidnight.getTime(), now.getTime())) };
}


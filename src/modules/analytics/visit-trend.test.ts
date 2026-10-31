import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { getVisitTrend, oldestTrendDate, parseVisitTrendRange } from "./visit-trend";

const now = new Date("2026-10-31T08:00:00.000Z");
const coverageStart = new Date("2026-09-01T00:00:00.000Z");
const query = vi.fn<(sql: Prisma.Sql) => Promise<unknown[]>>();
beforeEach(() => { query.mockReset().mockResolvedValue([]); });
const on = <T extends { days: Array<{ date: string }> }>(report: T, date: string) => report.days.find(day => day.date === date);

describe("daily visit trend", () => {
  it.each([["7", "2026-10-25", 7], ["30", "2026-10-02", 30]] as const)("returns %s inclusive Shanghai days and no personal identifiers", async (range, start, length) => {
    query.mockImplementation(async sql => {
      if (sql.sql.includes("analytics_visit_days")) return [{ day: "2026-10-30", views: BigInt(12) }];
      if (sql.sql.includes("analytics_page_views")) return [{ day: "2026-10-30", visitors: BigInt(3) }];
      return [];
    });
    const report = await getVisitTrend(range, { now, coverageStart, query });
    expect(report).toMatchObject({ range, startDate: start, endDate: "2026-10-31" });
    expect(report.days).toHaveLength(length);
    expect(on(report, "2026-10-30")).toEqual({ date: "2026-10-30", pv: 12, uv: 3, pvStatus: "available", uvStatus: "available" });
    expect(on(report, "2026-10-31")).toMatchObject({ pv: 0, uv: 0 });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => !sql.sql.includes("analytics_daily_visitors"))).toBe(true);
    const live = query.mock.calls.find(([sql]) => sql.sql.includes("analytics_page_views"))![0];
    expect(live.sql).toContain("COUNT(DISTINCT actor_kind, subject_id)");
    expect(live.sql).toContain("INTERVAL 8 HOUR");
    expect(live.values).toEqual([new Date(start + "T00:00:00+08:00"), now]);
    expect(JSON.stringify(report)).not.toMatch(/subject_id|account|organization|actor_kind/);
  });

  it("distinguishes pre-collection, partially collected, and observed zero days", async () => {
    const report = await getVisitTrend("7", { now, coverageStart: new Date("2026-10-30T02:00:00.000Z"), query });
    expect(on(report, "2026-10-29")).toMatchObject({ pv: null, uv: null, pvStatus: "not_collected", uvStatus: "not_collected" });
    expect(on(report, "2026-10-30")).toMatchObject({ pv: 0, uv: 0, pvStatus: "partial", uvStatus: "partial" });
    expect(on(report, "2026-10-31")).toMatchObject({ pv: 0, uv: 0, pvStatus: "available", uvStatus: "available" });
    expect(query.mock.calls[0][0].values).toEqual(["2026-10-30", "2026-10-31"]);
  });

  it("keeps rolling days before collection but returns no all-time series without a collection start", async () => {
    expect(await getVisitTrend("all", { now, coverageStart: null, query })).toEqual({ range: "all", startDate: null, endDate: "2026-10-31", days: [] });
    const report = await getVisitTrend("30", { now, coverageStart: null, query });
    expect(report.days).toHaveLength(30);
    expect(report.days.every(day => day.pv === null && day.uvStatus === "not_collected")).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it("all-time starts at collection and is capped at the daily summary expiry boundary", async () => {
    const report = await getVisitTrend("all", { now, coverageStart, query });
    expect(report.startDate).toBe("2026-09-01");
    expect(report.days).toHaveLength(61);
    const capped = await getVisitTrend("all", { now, coverageStart: new Date("2020-01-01Z"), query });
    expect(capped.startDate).toBe("2024-10-31");
    expect(capped.days).toHaveLength(731);
    expect(oldestTrendDate("2026-02-28")).toBe("2024-02-29");
    expect(oldestTrendDate("2028-02-29")).toBe("2026-02-28");
    expect(oldestTrendDate("2026-03-31")).toBe("2024-03-31");
  });

  it("uses full anonymous daily snapshots before the 180-day cutoff and never exposes truncated UV", async () => {
    const cutoff = new Date(+now - 180 * 86_400_000);
    const boundary = "2026-05-04";
    expect(cutoff.toISOString()).toBe("2026-05-04T08:00:00.000Z");
    query.mockImplementation(async sql => {
      if (sql.sql.includes("analytics_visit_days")) return [
        { day: "2026-05-02", views: BigInt(8) }, { day: "2026-05-03", views: BigInt(4) },
        { day: boundary, views: BigInt(6) }, { day: "2026-05-05", views: BigInt(9) },
      ];
      if (sql.sql.includes("analytics_page_views")) return [{ day: boundary, visitors: BigInt(1) }, { day: "2026-05-05", visitors: BigInt(2) }];
      return [{ day: "2026-05-02", visitors: BigInt(5) }, { day: boundary, visitors: BigInt(4) }, { day: "2026-05-05", visitors: BigInt(777) }];
    });
    const report = await getVisitTrend("all", { now, coverageStart: new Date("2026-04-01T00:00:00Z"), query });
    expect(on(report, "2026-05-02")).toMatchObject({ pv: 8, uv: 5, uvStatus: "available" });
    expect(on(report, "2026-05-03")).toMatchObject({ pv: 4, uv: null, uvStatus: "not_collected" });
    expect(on(report, boundary)).toMatchObject({ pv: 6, uv: 4, uvStatus: "available" });
    expect(on(report, "2026-05-05")).toMatchObject({ pv: 9, uv: 2 });
    expect(on(report, "2026-05-01")).toMatchObject({ pv: 0, uv: 0, uvStatus: "available" });
    expect(query.mock.calls.find(([sql]) => sql.sql.includes("analytics_page_views"))![0].values).toEqual([new Date(+cutoff + 1), now]);
  });

  it("allows the collection date to be complete relative to a later start within a cutoff day", async () => {
    const report = await getVisitTrend("all", { now, coverageStart: new Date("2026-05-04T10:00:00Z"), query });
    expect(report.days[0]).toMatchObject({ date: "2026-05-04", uv: 0, uvStatus: "partial" });
  });

  it("requires a full archived count when the cutoff is exactly midnight", async () => {
    const atMidnight = new Date("2026-10-31T16:00:00.000Z");
    const cutoff = new Date(+atMidnight - 180 * 86_400_000);
    const boundary = "2026-05-05";
    expect(cutoff.toISOString()).toBe("2026-05-04T16:00:00.000Z");
    query.mockImplementation(async sql => {
      if (sql.sql.includes("analytics_visit_days")) return [{ day: boundary, views: BigInt(2) }];
      if (sql.sql.includes("analytics_page_views")) return [{ day: boundary, visitors: BigInt(1) }];
      return [{ day: boundary, visitors: BigInt(2) }];
    });
    const options = { now: atMidnight, coverageStart: new Date("2026-01-01T00:00:00Z"), query };
    const withArchive = await getVisitTrend("all", options);
    expect(on(withArchive, boundary)).toMatchObject({ pv: 2, uv: 2, uvStatus: "available" });
    query.mockImplementation(async sql => {
      if (sql.sql.includes("analytics_visit_days")) return [{ day: boundary, views: BigInt(2) }];
      if (sql.sql.includes("analytics_page_views")) return [{ day: boundary, visitors: BigInt(1) }];
      return [];
    });
    const withoutArchive = await getVisitTrend("all", options);
    expect(on(withoutArchive, boundary)).toMatchObject({ pv: 2, uv: null, uvStatus: "not_collected" });
    const collectingAtCutoff = await getVisitTrend("all", { ...options, coverageStart: cutoff });
    expect(on(collectingAtCutoff, boundary)).toMatchObject({ pv: 2, uv: null, uvStatus: "not_collected" });
  });

  it("uses Shanghai midnight and includes the new day without counting it before time has elapsed", async () => {
    const report = await getVisitTrend("7", { now: new Date("2026-10-31T16:00:00.000Z"), coverageStart, query });
    expect(report.startDate).toBe("2026-10-26");
    expect(report.endDate).toBe("2026-11-01");
    expect(report.days.at(-1)).toMatchObject({ pv: 0, uv: 0, pvStatus: "available" });
    const justStarted = await getVisitTrend("7", { now: new Date("2026-10-31T16:00:00Z"), coverageStart: new Date("2026-10-31T16:00:00Z"), query });
    expect(justStarted.days.every(day => day.pv === null && day.uv === null)).toBe(true);
  });

  it("keeps independent daily sources working when one source fails", async () => {
    query.mockImplementation(async sql => {
      if (sql.sql.includes("analytics_visit_days")) throw Error("private mysql details");
      if (sql.sql.includes("analytics_page_views")) return [{ day: "2026-10-30", visitors: BigInt(3) }];
      return [];
    });
    const report = await getVisitTrend("7", { now, coverageStart, query });
    expect(on(report, "2026-10-30")).toMatchObject({ pv: null, pvStatus: "unavailable", uv: 3, uvStatus: "available" });
    expect(JSON.stringify(report)).not.toContain("private");
    query.mockImplementation(async sql => {
      if (sql.sql.includes("analytics_page_views")) throw Error("private details");
      return [];
    });
    const noLive = await getVisitTrend("7", { now, coverageStart, query });
    expect(noLive.days[0]).toMatchObject({ pv: 0, uv: null, uvStatus: "unavailable" });
  });

  it("distinguishes missing archived UV from an archive read failure and proves zero only with PV", async () => {
    query.mockImplementation(async sql => {
      if (sql.sql.includes("analytics_visit_days")) return [{ day: "2026-04-02", views: BigInt(3) }];
      if (sql.sql.includes("analytics_daily_visitors")) throw Error("missing migration");
      return [];
    });
    const report = await getVisitTrend("all", { now, coverageStart: new Date("2026-04-01T00:00:00Z"), query });
    expect(on(report, "2026-04-02")).toMatchObject({ pv: 3, uv: null, uvStatus: "unavailable" });
    expect(on(report, "2026-04-03")).toMatchObject({ pv: 0, uv: 0, uvStatus: "available" });
  });

  it.each([Number.MAX_SAFE_INTEGER + 1, -1, "3"])("rejects invalid aggregate count %s without hiding the other series", async value => {
    query.mockImplementation(async sql => sql.sql.includes("analytics_visit_days") ? [{ day: "2026-10-30", views: value }] : []);
    const report = await getVisitTrend("7", { now, coverageStart, query });
    expect(on(report, "2026-10-30")).toMatchObject({ pv: null, pvStatus: "unavailable", uv: 0 });
  });

  it("rejects invalid or future coverage values", async () => {
    await expect(getVisitTrend("7", { now, coverageStart: new Date("invalid"), query })).rejects.toThrow(RangeError);
    await expect(getVisitTrend("7", { now, coverageStart: new Date(+now + 1), query })).rejects.toThrow(RangeError);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("trend range parser", () => {
  it.each([["", "7"], ["range=7", "7"], ["range=30", "30"], ["range=all", "all"]])("accepts %s", (params, range) => {
    expect(parseVisitTrendRange(new URLSearchParams(params))).toBe(range);
  });
  it.each(["range=", "range=week", "range=365", "range=7&range=30", "range=all&employee=someone", "view=line", "range=7&start=2026-10-30"])("rejects %s", params => {
    expect(() => parseVisitTrendRange(new URLSearchParams(params))).toThrow(RangeError);
  });
});

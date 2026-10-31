import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { getUsageReport } from "./report";
import { parseReportPeriod } from "./report-period";

const now = new Date("2026-10-31T08:00:00.000Z");
const period = parseReportPeriod(new URLSearchParams(), now);
const query = vi.fn<(query: Prisma.Sql) => Promise<unknown[]>>();
beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async sql => {
    if (sql.sql.includes("DATE_FORMAT")) return [{ day: "2026-10-30", views: BigInt(9) }];
    if (sql.sql.includes("GROUP BY module")) return [{ module: "hermit", views: BigInt(6) }, { module: "action", views: BigInt(3) }];
    if (sql.sql.includes("AS employees")) return [{ employees: BigInt(4), guests: BigInt(2) }];
    if (sql.sql.includes("AS conversations")) return [{ conversations: BigInt(2), rounds: BigInt(5) }];
    if (sql.sql.includes("AS department")) return [{ department: "售后服务/运营部", views: BigInt(6) }];
    if (sql.sql.includes("AS missing")) return [{ missing: BigInt(2) }];
    throw new Error("Unexpected query");
  });
});

describe("usage report", () => {
  it("returns independent annual heatmap and exact period aggregates", async () => {
    const report = await getUsageReport(period, { now, query, coverageStart: new Date("2025-01-01T00:00:00Z") });
    expect(report.heatmap.days).toHaveLength(365);
    expect(report.heatmap.startDate).toBe("2025-11-01");
    expect(report.heatmap.endDate).toBe("2026-10-31");
    expect(report.heatmap.days.find(day => day.date === "2026-10-30")?.views).toBe(9);
    expect(report.visits.total).toBe(9);
    expect(report.visits.modules.map(item => item.label)).toEqual(["路引", "笃行"]);
    expect(report.visitors).toMatchObject({ status: "available", employees: 4, guests: 2 });
    expect(report.ai).toMatchObject({ conversations: 2, rounds: 5 });
    expect(report.departments.items).toEqual([{ department: "售后服务/运营部", views: 6 }]);
    expect(report.departments.unknownOrganizationVisits).toBe(2);
    for (const [sql] of query.mock.calls) {
      expect(sql.sql).not.toMatch(/SELECT\s+(content|subject_id|user_id|account|display_name)\b/i);
      expect(sql.sql).not.toContain(now.toISOString());
    }
    const department = query.mock.calls.find(([sql]) => sql.sql.includes("AS department"))![0];
    expect(department.sql).toContain("HAVING COUNT(DISTINCT subject_id) >= 5");
    expect(department.sql).toContain("TRIM(organization) <> ''");
    expect(department.sql).toContain("ORDER BY views DESC, organization ASC LIMIT 10");
  });
  it("separates never-collected dates, partial first day and observed zero", async () => {
    query.mockImplementation(async sql => {
      if (sql.sql.includes("AS conversations")) return [{ conversations: BigInt(0), rounds: BigInt(0) }];
      if (sql.sql.includes("AS employees")) return [{ employees: BigInt(0), guests: BigInt(0) }];
      if (sql.sql.includes("AS missing")) return [{ missing: BigInt(0) }];
      return [];
    });
    const start = new Date("2026-10-30T02:00:00.000Z");
    const report = await getUsageReport(period, { now, query, coverageStart: start });
    expect(report.visits).toMatchObject({ status: "partial", total: 0, observedFrom: start.toISOString() });
    expect(report.heatmap.days.find(day => day.date === "2026-10-29")).toMatchObject({ views: null, status: "not_collected" });
    expect(report.heatmap.days.find(day => day.date === "2026-10-30")).toMatchObject({ views: 0, status: "partial" });
    expect(report.heatmap.days.find(day => day.date === "2026-10-31")).toMatchObject({ views: 0, status: "available" });
    expect(report.visitors.employees).toBe(0);
    const visitSql = query.mock.calls.find(([sql]) => sql.sql.includes("GROUP BY module"))![0];
    expect(visitSql.values).toEqual(["2026-10-30", "2026-10-31"]);
  });
  it("reads only saved AI messages when page collection is disabled", async () => {
    const report = await getUsageReport(period, { now, query, coverageStart: null });
    expect(query).toHaveBeenCalledTimes(1);
    expect(report.visits.total).toBeNull();
    expect(report.visitors.employees).toBeNull();
    expect(report.departments.items).toEqual([]);
    expect(report.heatmap.days.every(day => day.views === null)).toBe(true);
    expect(report.ai.rounds).toBe(5);
  });
  it("restricts personal aggregates to the surviving 180-day detail window", async () => {
    const old = parseReportPeriod(new URLSearchParams("preset=custom&start=2025-10-31&end=2026-10-31"), now);
    const report = await getUsageReport(old, { now, query, coverageStart: new Date("2024-01-01T00:00:00Z") });
    const cutoff = new Date(now.getTime() - 180 * 86_400_000);
    expect(report.visits.status).toBe("available");
    expect(report.visitors).toMatchObject({ status: "partial", observedFrom: cutoff.toISOString() });
    expect(report.departments.status).toBe("partial");
    const visitorSql = query.mock.calls.find(([sql]) => sql.sql.includes("AS employees"))![0];
    expect(visitorSql.values).toEqual([cutoff, now]);
    expect(visitorSql.sql).toContain("COUNT(DISTINCT CASE");
  });
  it("does not label expired-only detail windows as zero visitors", async () => {
    const old = parseReportPeriod(new URLSearchParams("preset=custom&start=2025-10-31&end=2025-11-30"), now);
    const report = await getUsageReport(old, { now, query, coverageStart: new Date("2024-01-01T00:00:00Z") });
    expect(report.visits.status).toBe("available");
    expect(report.visitors.status).toBe("not_collected");
    expect(report.visitors.employees).toBeNull();
  });
  it("keeps failing sources unavailable while independent sources still render", async () => {
    query.mockImplementation(async sql => {
      if (sql.sql.includes("AS conversations")) return [{ conversations: BigInt(0), rounds: BigInt(0) }];
      throw new Error("mysql://private fixture");
    });
    const report = await getUsageReport(period, { now, query, coverageStart: new Date("2025-01-01Z") });
    expect(report.heatmap.status).toBe("unavailable");
    expect(report.visits).toMatchObject({ status: "unavailable", total: null });
    expect(report.visitors.employees).toBeNull();
    expect(report.ai).toMatchObject({ status: "available", rounds: 0 });
    expect(JSON.stringify(report)).not.toContain("private fixture");
  });
  it("rejects unsafe aggregate counts rather than fabricating totals", async () => {
    query.mockImplementation(async () => [{ employees: Number.MAX_SAFE_INTEGER + 1, guests: 0 }]);
    const report = await getUsageReport(period, { now, query, coverageStart: new Date("2025-01-01Z") });
    expect(report.visitors.status).toBe("unavailable");
  });
});


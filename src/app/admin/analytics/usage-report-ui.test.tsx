import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UsageReport } from "@/modules/analytics/report";
import { calendarWeeks, heatmapLevel, VisitHeatmap } from "./VisitHeatmap";
import { ReportPeriodFilter } from "./ReportPeriodFilter";
import { UsageReportView } from "./UsageReportView";

const source = { status: "available" as const, observedFrom: "2026-10-01T00:00:00.000Z", note: "" };
const report: UsageReport = {
  period: { preset: "month", startDate: "2026-10-01", endDate: "2026-10-31", timeZone: "Asia/Shanghai" },
  generatedAt: "2026-10-31T08:00:00.000Z",
  heatmap: { ...source, startDate: "2025-11-01", endDate: "2026-10-31", days: [
    { date: "2026-10-29", views: null, status: "not_collected" },
    { date: "2026-10-30", views: 0, status: "available" },
    { date: "2026-10-31", views: 4, status: "partial" },
  ] },
  visits: { ...source, total: 4, coverageStart: source.observedFrom, modules: [{ module: "hermit", label: "路引", views: 4 }] },
  visitors: { ...source, employees: 1, guests: 2 },
  ai: { ...source, conversations: 1, rounds: 3 },
  departments: { ...source, items: [{ department: "售后服务 / 华南", views: 12 }], unknownOrganizationVisits: 0 },
};

describe("access calendar and period report", () => {
  it("distinguishes missing days and measured zero, including focusable daily labels", () => {
    const html = renderToStaticMarkup(<VisitHeatmap heatmap={report.heatmap} />);
    expect(html).toContain('aria-label="2026/10/29，尚未采集"');
    expect(html).toContain('aria-label="2026/10/30，0 次访问"');
    expect(html).toContain('aria-label="2026/10/31，4 次访问（部分记录）"');
    expect(html).toContain('data-level="unknown"');
    expect(html).toContain('data-level="zero"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("过去 365 天");
  });

  it("aligns week columns to Monday with padding outside the supplied date range", () => {
    const weeks = calendarWeeks(report.heatmap.days);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]?.date).toBe("2026-10-29");
    expect(weeks[0][6]).toBeNull();
    expect(calendarWeeks([])).toEqual([]);
  });

  it("uses heat levels without painting a missing value as zero", () => {
    expect(heatmapLevel(null, 100)).toBe("unknown");
    expect(heatmapLevel(0, 100)).toBe("zero");
    expect(heatmapLevel(1, 100)).toBe("1");
    expect(heatmapLevel(51, 100)).toBe("3");
    expect(heatmapLevel(100, 100)).toBe("4");
  });

  it("shows calendar presets and explicit custom start/end controls", () => {
    const html = renderToStaticMarkup(<ReportPeriodFilter period={{ ...report.period, preset: "custom" }} today="2026-10-31" />);
    expect(html).toContain('href="/admin/analytics?preset=week"');
    expect(html).toContain('href="/admin/analytics?preset=month"');
    expect(html).toMatch(/<input (?=[^>]*name="preset")(?=[^>]*type="hidden")(?=[^>]*value="custom")[^>]*\/>/);
    expect(html).toContain('name="start"');
    expect(html).toContain('name="end"');
    expect(html).toContain('max="2026-10-31"');
    expect(html).toContain('action="/admin/analytics"');
  });

  it("renders the requested metrics and department/module views", () => {
    const html = renderToStaticMarkup(<UsageReportView report={report} />);
    expect(html).toContain("访问次数");
    expect(html).toContain("去重访问人数");
    expect(html).toContain("员工 1 人 · 访客 2 个标识");
    expect(html).toContain("AI 对话次数");
    expect(html).toContain("AI 对话轮次");
    expect(html).toContain("常用模块访问次数");
    expect(html).toContain("访问最多的 Top 10 部门");
    expect(html).toContain("售后服务 / 华南");
  });

  it("keeps a measured zero visible and puts partial coverage next to the count", () => {
    const html = renderToStaticMarkup(<UsageReportView report={{ ...report,
      visits: { ...report.visits, total: 0, modules: [], status: "partial", observedFrom: "2026-10-30T00:00:00.000Z" },
      visitors: { ...report.visitors, employees: null, guests: null, status: "not_collected", note: "尚未采集" },
    }} />);
    expect(html).toContain("<dd>0<span>次</span></dd>");
    expect(html).toContain("<dd>—<span>个</span></dd>");
    expect(html).toContain("已记录范围自 2026/10/30 08:00 起（北京时间）");
  });
});

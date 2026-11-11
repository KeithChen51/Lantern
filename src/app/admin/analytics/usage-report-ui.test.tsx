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
  visits: { ...source, total: 14, coverageStart: source.observedFrom, modules: [{ module: "hermit", label: "路引", views: 14 }] },
  visitors: { ...source, total: 6, employees: 1, guests: 2, byIdentity: [
    { source: "employee", views: 4, visitors: 1 },
    { source: "dealer", views: 5, visitors: 2 },
    { source: "guest", views: 3, visitors: 2 },
    { source: "unknown", views: 2, visitors: 1 },
  ] },
  ai: { ...source, conversations: 6, rounds: 12, byIdentity: [
    { source: "employee", conversations: 1, rounds: 3 },
    { source: "dealer", conversations: 2, rounds: 4 },
    { source: "unknown", conversations: 3, rounds: 5 },
  ] },
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
    expect(html).toContain("<dd>14<span>次</span></dd>");
    expect(html).toContain("<dd>6<span>个</span></dd>");
    expect(html).toContain("AI 对话次数");
    expect(html).toContain("AI 对话轮次");
    expect(html).toContain("常用模块访问次数");
    expect(html).toContain("访问最多的 Top 10 部门");
    expect(html).toContain("售后服务 / 华南");
  });

  it("renders all identity metrics with accessible row and column headers", () => {
    const html = renderToStaticMarkup(<UsageReportView report={report} />);
    expect(html).toContain('id="identity-metrics-title">按身份来源');
    expect(html).toMatch(/<table [^>]*aria-labelledby="identity-metrics-title"[^>]*aria-describedby="identity-coverage-note"/);
    const tableHtml = html.replaceAll("<wbr/>", "");
    expect(tableHtml).toContain('<th scope="col">访问次数 <small>PV</small></th>');
    expect(tableHtml).toContain('<th scope="col">去重访问人数 <small>UV</small></th>');
    expect(tableHtml).toContain('<th scope="col">路引对话</th>');
    expect(tableHtml).toContain('<th scope="col">提问轮次</th>');
    expect(html).toContain('<th scope="row">比亚迪集团员工</th><td>4</td><td>1</td><td>1</td><td>3</td>');
    expect(html).toContain('<th scope="row">比亚迪汽车企微</th><td>5</td><td>2</td><td>2</td><td>4</td>');
    expect(html).toContain('<th scope="row">匿名访客</th><td>3</td><td>2</td><td>0</td><td>0</td>');
    expect(html).toContain('<th scope="row">身份不明</th><td>2</td><td>1</td><td>3</td><td>5</td>');
    expect(html).toContain("汽车企微的页面访问从 1.6.10 上线并确认访问告知后开始记录");
    expect(html).toContain("— 表示暂无可用数据");
  });

  it("preserves measured zeros and distinguishes unrecorded dealer visits from zero", () => {
    const sparse = renderToStaticMarkup(<UsageReportView report={{ ...report,
      visitors: { ...report.visitors, status: "partial", total: 0, employees: 0, guests: 0, byIdentity: [] },
      ai: { ...report.ai, conversations: 0, rounds: 0, byIdentity: [] },
    }} />);
    expect(sparse).toContain('<th scope="row">比亚迪集团员工</th><td>0</td><td>0</td><td>0</td><td>0</td>');
    expect(sparse).toContain('<th scope="row">比亚迪汽车企微</th><td>—</td><td>—</td><td>0</td><td>0</td>');
    expect(sparse).toContain('<th scope="row">匿名访客</th><td>0</td><td>0</td><td>0</td><td>0</td>');
    expect(sparse).not.toContain('<th scope="row">身份不明</th>');
    expect(sparse).toContain('aria-describedby="identity-coverage-note visit-detail-coverage"');
    const measured = renderToStaticMarkup(<UsageReportView report={{ ...report,
      visitors: { ...report.visitors, byIdentity: [{ source: "dealer", views: 0, visitors: 0 }] },
    }} />);
    expect(measured).toContain('<th scope="row">比亚迪汽车企微</th><td>0</td><td>0</td><td>2</td><td>4</td>');
    expect(measured).toContain('<th scope="row">身份不明</th><td>0</td><td>0</td><td>3</td><td>5</td>');
  });

  it("keeps a measured zero visible and puts partial coverage next to the count", () => {
    const html = renderToStaticMarkup(<UsageReportView report={{ ...report,
      visits: { ...report.visits, total: 0, modules: [], status: "partial", observedFrom: "2026-10-30T00:00:00.000Z" },
      visitors: { ...report.visitors, total: null, employees: null, guests: null, status: "not_collected", note: "尚未采集" },
    }} />);
    expect(html).toContain("<dd>0<span>次</span></dd>");
    expect(html).toContain("<dd>—<span>个</span></dd>");
    expect(html).toContain("已记录范围自 2026/10/30 08:00 起（北京时间）");
    expect(html).toContain('<th scope="row">比亚迪集团员工</th><td>—</td><td>—</td><td>1</td><td>3</td>');
    expect(html).toContain('<th scope="row">身份不明</th><td>—</td><td>—</td><td>3</td><td>5</td>');
  });

  it("uses recorded period PV for module shares and preserves partial coverage", () => {
    const html = renderToStaticMarkup(<UsageReportView report={{ ...report,
      visits: { ...report.visits, total: 100, status: "partial", note: "仅包含已采集的日期", modules: [
        { module: "mirror", label: "镜鉴", views: 30 },
        { module: "hermit", label: "路引", views: 60 },
      ] },
    }} />);
    expect(html).toContain('aria-label="占已记录访问 60%"');
    expect(html).toContain('aria-label="占已记录访问 30%"');
    expect(html).toContain('style="width:60%"');
    expect(html).not.toContain("66.7%");
    expect(html.indexOf(">路引<")).toBeLessThan(html.indexOf(">镜鉴<"));
    expect(html).toContain("仅包含已采集的日期");
    expect(html).toContain("模块占比仅反映已记录范围");
  });

  it("keeps unavailable denominators and positive tiny shares distinct from zero", () => {
    const unknown = renderToStaticMarkup(<UsageReportView report={{ ...report,
      visits: { ...report.visits, total: null },
    }} />);
    expect(unknown).toContain('aria-label="占比暂不可用"');
    expect(unknown).not.toContain('aria-label="占已记录访问 0%"');
    const small = renderToStaticMarkup(<UsageReportView report={{ ...report,
      visits: { ...report.visits, total: 100_000, modules: [{ module: "hermit", label: "路引", views: 1 }] },
    }} />);
    expect(small).toContain('aria-label="占已记录访问 &lt;0.1%"');
    expect(small).not.toContain('aria-label="占已记录访问 0%"');
    const zero = renderToStaticMarkup(<UsageReportView report={{ ...report,
      visits: { ...report.visits, total: 0, modules: [{ module: "hermit", label: "路引", views: 0 }] },
    }} />);
    expect(zero).toContain('style="width:0%"');
    expect(zero).toContain('aria-label="占比暂不可用"');
    expect(zero).not.toMatch(/NaN|Infinity/);
  });

  it("compares departments to their largest observed count and preserves missing organization notes", () => {
    const html = renderToStaticMarkup(<UsageReportView report={{ ...report,
      departments: { ...report.departments, status: "partial", note: "达到样本门槛的部门才会展示", unknownOrganizationVisits: 9, items: [
        { department: "服务 B", views: 5 }, { department: "服务 A", views: 20 },
      ] },
    }} />);
    expect(html.indexOf("服务 A")).toBeLessThan(html.indexOf("服务 B"));
    expect(html).toContain('style="width:25%"');
    expect(html).toContain("达到样本门槛的部门才会展示");
    expect(html).toContain("另有 9 次员工访问未提供部门");
  });

  it("does not draw source values when the source is unavailable", () => {
    const html = renderToStaticMarkup(<UsageReportView report={{ ...report,
      visits: { ...report.visits, total: null, status: "unavailable", note: "访问数据读取失败" },
      visitors: { ...report.visitors, total: null, status: "unavailable", note: "访问明细读取失败" },
      ai: { ...report.ai, conversations: null, rounds: null, status: "unavailable", note: "路引数据读取失败" },
      departments: { ...report.departments, status: "unavailable", note: "部门数据读取失败" },
    }} />);
    expect(html).toContain("访问数据读取失败");
    expect(html).toContain("访问明细读取失败");
    expect(html).toContain("路引数据读取失败");
    expect(html).toContain("部门数据读取失败");
    expect(html).toContain('<th scope="row">比亚迪汽车企微</th><td>—</td><td>—</td><td>—</td><td>—</td>');
    expect(html).not.toContain('<th scope="row">身份不明</th>');
    expect(html).not.toContain('aria-label="占已记录访问');
    expect(html).not.toContain("售后服务 / 华南");
  });
});

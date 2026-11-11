import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageReport } from "@/modules/analytics/report";

const { knowledgeAdmin, analyticsAdmin, report, requestHeaders } = vi.hoisted(() => ({
  knowledgeAdmin: vi.fn(), analyticsAdmin: vi.fn(), report: vi.fn(), requestHeaders: vi.fn(),
}));
vi.mock("@/modules/auth/access", () => ({ requireKnowledgeAdmin: knowledgeAdmin, requireAnalyticsSummary: analyticsAdmin }));
vi.mock("@/modules/analytics/report", () => ({ getUsageReport: report }));
vi.mock("next/headers", () => ({ headers: requestHeaders }));
vi.mock("./knowledge/AdminKnowledgeManager", () => ({ AdminKnowledgeManager: () => <p>知识文件工作区</p> }));
vi.mock("./hermit-records/HermitRecords", () => ({
  HermitRecords: () => <section>会话列表</section>,
}));
vi.mock("./analytics/EmployeeRankings", () => ({
  EmployeeRankings: ({ period }: Pick<UsageReport, "period">) => <section data-ranking-start={period.startDate}>员工榜单</section>,
}));

import KnowledgePage from "./knowledge/page";
import HermitRecordsPage from "./hermit-records/page";
import AnalyticsPage from "./analytics/page";

const coverage = { status: "available" as const, observedFrom: null, note: "" };
const fixture: UsageReport = {
  period: { preset: "week", startDate: "2026-10-26", endDate: "2026-10-31", timeZone: "Asia/Shanghai" },
  generatedAt: "2026-10-31T08:30:00.000Z",
  heatmap: { ...coverage, startDate: "2025-11-01", endDate: "2026-10-31", days: [{ date: "2026-10-31", views: 0, status: "available" }] },
  visits: { ...coverage, total: 0, modules: [], coverageStart: null },
  visitors: { ...coverage, employees: 0, guests: 0, total: 0, byIdentity: [] },
  ai: { ...coverage, conversations: 0, rounds: 0, byIdentity: [] },
  departments: { ...coverage, items: [], unknownOrganizationVisits: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T08:30:00.000Z"));
  requestHeaders.mockResolvedValue(new Headers({ cookie: "fixture" }));
  knowledgeAdmin.mockResolvedValue({ userId: "admin", capabilities: ["knowledge:manage"] });
  analyticsAdmin.mockResolvedValue({ userId: "admin", capabilities: ["knowledge:manage", "analytics:summary"] });
  report.mockImplementation(async period => ({ ...fixture, period }));
});
afterEach(() => vi.useRealTimers());

describe("platform management pages", () => {
  it("keeps one knowledge-only tab for the knowledge administrator", async () => {
    const html = renderToStaticMarkup(await KnowledgePage());
    expect(html).toContain("知识文件工作区");
    expect(html).toContain('aria-label="平台管理页面"');
    expect(html).toMatch(/<a (?=[^>]*href="\/admin\/knowledge")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html).not.toContain("/admin/analytics");
    expect(html).not.toContain("/admin/hermit-records");
    expect(report).not.toHaveBeenCalled();
  });

  it("keeps knowledge and analytics but hides records for a platform administrator", async () => {
    knowledgeAdmin.mockResolvedValue({ capabilities: ["knowledge:manage", "analytics:summary"] });
    const html = renderToStaticMarkup(await KnowledgePage());
    expect(html).toContain('href="/admin/knowledge"');
    expect(html).toContain('href="/admin/analytics"');
    expect(html).not.toContain("/admin/hermit-records");
  });

  it("returns not found on the direct records URL even with administrator authorization", async () => {
    await expect(HermitRecordsPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(analyticsAdmin).not.toHaveBeenCalled();
    expect(requestHeaders).not.toHaveBeenCalled();
  });

  it.each([401, 403, 503])("rejects knowledge requests before loading the workspace (%s)", async status => {
    knowledgeAdmin.mockRejectedValue({ status, message: "private authorization detail" });
    const html = renderToStaticMarkup(await KnowledgePage());
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("知识文件工作区");
    expect(html).not.toContain("private authorization detail");
  });

  it.each([401, 403, 503])("authenticates before parsing or loading analytics (%s)", async status => {
    analyticsAdmin.mockRejectedValue({ status, message: "private authorization detail" });
    const html = renderToStaticMarkup(await AnalyticsPage({ searchParams: Promise.resolve({ preset: "invalid" }) }));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("private authorization detail");
    expect(report).not.toHaveBeenCalled();
    expect(html).not.toContain("员工榜单");
    expect(html).toContain('href="/"');
  });

  it.each([
    { query: {}, preset: "week", start: "2026-10-26" },
    { query: { preset: "month" }, preset: "month", start: "2026-10-01" },
    { query: { preset: "custom", start: "2026-10-15", end: "2026-10-25" }, preset: "custom", start: "2026-10-15" },
  ])("loads the requested calendar range $preset", async ({ query, preset, start }) => {
    const html = renderToStaticMarkup(await AnalyticsPage({ searchParams: Promise.resolve(query) }));
    expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ preset, startDate: start }), { now: new Date("2026-10-31T08:30:00.000Z") });
    expect(html.indexOf('aria-label="平台管理页面"')).toBeLessThan(html.indexOf("访问日历"));
    expect(html).toContain('<h2 id="period-report-title">时段统计</h2>');
    const reportHeading = html.indexOf('<h2 id="period-report-title">');
    expect(html.indexOf("访问日历")).toBeLessThan(reportHeading);
    expect(reportHeading).toBeLessThan(html.indexOf("员工榜单"));
    expect(html).toContain(`data-ranking-start="${start}"`);
    expect(html).not.toContain("/admin/hermit-records");
    expect(html).toContain('aria-label="统计时间范围"');
    expect(html).toContain("本周");
    expect(html).toContain("本月");
    expect(html).toContain("自定义");
  });

  it.each([
    { preset: "custom", start: "2026-10-31", end: "2026-10-01" },
    { preset: ["week", "month"] },
    { preset: "custom", start: "2026-11-01", end: "2026-11-05" },
  ])("renders a recoverable invalid range without reading report data", async query => {
    const html = renderToStaticMarkup(await AnalyticsPage({ searchParams: Promise.resolve(query) }));
    expect(html).toContain("请选择有效的统计日期");
    expect(html).toContain("查看本周统计");
    expect(report).not.toHaveBeenCalled();
  });

  it("keeps the report retry as a real reload and hides the underlying source error", async () => {
    report.mockRejectedValue(new Error("secret database connection string"));
    const html = renderToStaticMarkup(await AnalyticsPage({ searchParams: Promise.resolve({ preset: "month" }) }));
    expect(html).toContain("访问统计暂不可用");
    expect(html).toContain('href="/admin/analytics?preset=month"');
    expect(html).not.toContain("secret database connection string");
    expect(html).not.toContain("员工榜单");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsSummary } from "@/modules/analytics/summary";

const { knowledgeAdmin, analyticsAdmin, summary, requestHeaders } = vi.hoisted(() => ({ knowledgeAdmin: vi.fn(), analyticsAdmin: vi.fn(), summary: vi.fn(), requestHeaders: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireKnowledgeAdmin: knowledgeAdmin, requireAnalyticsSummary: analyticsAdmin }));
vi.mock("@/modules/analytics/summary", () => ({ getAnalyticsSummary: summary }));
vi.mock("next/headers", () => ({ headers: requestHeaders }));
vi.mock("./knowledge/AdminKnowledgeManager", () => ({ AdminKnowledgeManager: () => <p>知识文件工作区</p> }));

import KnowledgePage from "./knowledge/page";
import AnalyticsPage from "./analytics/page";
import { AnalyticsSummaryView } from "./analytics/AnalyticsSummaryView";

const fixture: AnalyticsSummary = {
  period: { days: 7, startDate: "2026-10-25", endDate: "2026-10-31", timeZone: "Asia/Shanghai", generatedAt: "2026-10-31T08:30:00.000Z" },
  sections: [
    { id: "auth", title: "登录记录", status: "available", source: "认证记录", description: "已保存的登录记录", metrics: [{ key: "login", label: "成功登录", value: 0, unit: "次" }], note: "登录不等于业务活跃。" },
    { id: "coverage", title: "页面与搜索", status: "not_collected", source: "尚未接入", description: "后续接入", metrics: [{ key: "pv", label: "页面浏览", value: null, unit: "次" }], note: "当前没有页面访问来源。" },
    { id: "knowledge", title: "知识供给", status: "unavailable", source: "知识库", description: "当前库存快照", metrics: [{ key: "stock", label: "当前库存", value: null, unit: "份" }], note: "无法读取。" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  requestHeaders.mockResolvedValue(new Headers({ cookie: "fixture" }));
  knowledgeAdmin.mockResolvedValue({ capabilities: ["knowledge:manage"] });
  analyticsAdmin.mockResolvedValue({ capabilities: ["knowledge:manage", "analytics:summary"] });
  summary.mockResolvedValue(fixture);
});

describe("platform management pages", () => {
  it("keeps the knowledge workspace available with one knowledge-only tab for the knowledge administrator", async () => {
    const html = renderToStaticMarkup(await KnowledgePage());
    expect(html).toContain("知识文件工作区");
    expect(html).toContain('aria-label="平台管理页面"');
    expect(html).toMatch(/<a (?=[^>]*href="\/admin\/knowledge")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html).not.toContain("/admin/analytics");
    expect(summary).not.toHaveBeenCalled();
  });

  it("shows both management pages to the platform administrator", async () => {
    knowledgeAdmin.mockResolvedValue({ capabilities: ["knowledge:manage", "analytics:summary"] });
    const html = renderToStaticMarkup(await KnowledgePage());
    expect(html).toContain('href="/admin/knowledge"');
    expect(html).toContain('href="/admin/analytics"');
  });

  it.each([401, 403, 503])("does not render the knowledge workspace on a rejected request (%s)", async status => {
    knowledgeAdmin.mockRejectedValue({ status, message: "private authorization detail" });
    const html = renderToStaticMarkup(await KnowledgePage());
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("知识文件工作区");
    expect(html).not.toContain("private authorization detail");
  });

  it.each([401, 403, 503])("does not read or render analytics on a rejected direct page visit (%s)", async status => {
    analyticsAdmin.mockRejectedValue({ status, message: "private authorization detail" });
    const html = renderToStaticMarkup(await AnalyticsPage({ searchParams: Promise.resolve({ days: "30" }) }));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("已保存的登录记录");
    expect(html).not.toContain("private authorization detail");
    expect(summary).not.toHaveBeenCalled();
    expect(html).toContain('href="/"');
  });

  it.each([{ days: undefined, expected: 7 }, { days: "7", expected: 7 }, { days: "30", expected: 30 }, { days: "365", expected: 7 }, { days: ["7", "30"], expected: 7 }])("uses the supported summary range for $days", async ({ days, expected }) => {
    const html = renderToStaticMarkup(await AnalyticsPage({ searchParams: Promise.resolve({ days }) }));
    expect(summary).toHaveBeenCalledExactlyOnceWith(expected);
    expect(html).toContain('aria-label="统计时间范围"');
    expect(html).toContain("日常查看汇总数据");
  });

  it("renders a recovery link without disclosing an unexpected database error", async () => {
    summary.mockRejectedValue(new Error("secret database connection string"));
    const html = renderToStaticMarkup(await AnalyticsPage({ searchParams: Promise.resolve({ days: "30" }) }));
    expect(html).toContain("访问统计暂不可用");
    expect(html).toContain('href="/admin/analytics?days=30"');
    expect(html).not.toContain("secret database connection string");
  });

  it("keeps a measured zero distinct from missing collection and a failing source", () => {
    const html = renderToStaticMarkup(<AnalyticsSummaryView summary={fixture} />);
    expect(html).toContain("成功登录</dt><dd>0");
    expect(html).toContain("页面浏览</dt><dd>—");
    expect(html).toContain("当前库存</dt><dd>—");
    expect(html).toContain("尚未采集");
    expect(html).toContain("读取暂不可用");
    expect(html).toContain("2026-10-25");
    expect(html).toContain("2026-10-31");
    expect(html).toContain("北京时间");
    expect(html).not.toContain("员工排名");
    expect(html).not.toContain("导出");
  });
});

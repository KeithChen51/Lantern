import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VisitTrend } from "@/modules/analytics/visit-trend";
import { VisitActivity } from "./VisitActivity";
import { heatmapLevel, heatmapScale, VisitHeatmap } from "./VisitHeatmap";
import { describeTrendValue, readTrendResponse, trendSegments, VisitLineChart } from "./VisitTrend";

const report: VisitTrend = {
  range: "7", startDate: "2026-10-27", endDate: "2026-10-31",
  days: [
    { date: "2026-10-27", pv: 2, uv: 1, pvStatus: "available", uvStatus: "available" },
    { date: "2026-10-28", pv: 0, uv: 0, pvStatus: "available", uvStatus: "available" },
    { date: "2026-10-29", pv: 4, uv: null, pvStatus: "available", uvStatus: "not_collected" },
    { date: "2026-10-30", pv: null, uv: null, pvStatus: "unavailable", uvStatus: "unavailable" },
    { date: "2026-10-31", pv: 3, uv: 2, pvStatus: "partial", uvStatus: "partial" },
  ],
};

describe("visit trend chart", () => {
  it("keeps the square-day calendar as the default and exposes both view controls", () => {
    const html = renderToStaticMarkup(<VisitActivity heatmap={{
      startDate: "2025-11-01", endDate: "2026-10-31", status: "available", observedFrom: null, note: "",
      days: [{ date: "2026-10-31", views: 1, status: "available" }],
    }} />);
    expect(html).toContain("访问日历");
    expect(html).toContain('aria-label="访问图表视图"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>热力图<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>折线图<\/button>/);
    expect(html).not.toContain("正在加载访问趋势");
  });

  it("breaks each series at its own missing dates while retaining observed zero", () => {
    expect(trendSegments(report.days, "pv")).toEqual([
      [{ index: 0, value: 2 }, { index: 1, value: 0 }, { index: 2, value: 4 }],
      [{ index: 4, value: 3 }],
    ]);
    expect(trendSegments(report.days, "uv")).toEqual([
      [{ index: 0, value: 1 }, { index: 1, value: 0 }],
      [{ index: 4, value: 2 }],
    ]);
    expect(trendSegments([{ ...report.days[0], pv: 9, pvStatus: "unavailable" }], "pv")).toEqual([]);
  });

  it("labels zero, incomplete observations and unavailable values distinctly", () => {
    expect(describeTrendValue(0, "available")).toBe("0");
    expect(describeTrendValue(2, "partial")).toBe("2（部分记录）");
    expect(describeTrendValue(null, "not_collected")).toBe("暂无完整记录");
    expect(describeTrendValue(null, "unavailable")).toBe("暂时无法读取");
  });

  it("renders accessible day lookup, both series and the latest date details", () => {
    const html = renderToStaticMarkup(<VisitLineChart report={report} />);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("左右方向键逐日查看");
    expect(html).toContain("PV 实线圆点与 UV 虚线方点");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("2026/10/31");
    expect(html).toContain("3（部分记录）");
    expect(html).toContain("2（部分记录）");
    expect(html).toContain("缺少完整记录的日期留空");
    expect(html.match(/<path /g)).toHaveLength(2);
    expect(html.match(/<circle /g)).toHaveLength(2);
    expect(html.match(/<rect /g)).toHaveLength(2);
  });

  it("labels only attainable heatmap intervals, including a single observed visit", () => {
    for (const maximum of [0, 1, 2, 3, 5, 100]) {
      const scale = heatmapScale(maximum);
      const counts = scale.flatMap(bin => Array.from({ length: bin.maximum - bin.minimum + 1 }, (_, index) => {
        const count = bin.minimum + index;
        expect(heatmapLevel(count, maximum)).toBe(bin.level);
        return count;
      }));
      expect(counts).toEqual(Array.from({ length: maximum + 1 }, (_, index) => index));
    }
    expect(heatmapScale(1)).toEqual([
      { level: "zero", minimum: 0, maximum: 0 }, { level: "4", minimum: 1, maximum: 1 },
    ]);
    const html = renderToStaticMarkup(<VisitHeatmap heatmap={{
      startDate: "2026-10-31", endDate: "2026-10-31", status: "partial", observedFrom: null, note: "",
      days: [{ date: "2026-10-31", views: 1, status: "partial" }],
    }} />);
    expect(html).toContain('title="1 次已记录访问"');
    expect(html).toContain("未采集／不可用");
    expect(html).toContain("部分记录可能低于实际访问次数");
  });

  it("does not stretch the count axis for values marked unavailable", () => {
    const html = renderToStaticMarkup(<VisitLineChart report={{ ...report,
      startDate: "2026-10-30", days: [
        { date: "2026-10-30", pv: 900, uv: 900, pvStatus: "unavailable", uvStatus: "unavailable" },
        { date: "2026-10-31", pv: 1, uv: 1, pvStatus: "available", uvStatus: "available" },
      ],
    }} />);
    expect(html).toContain('text-anchor="end">1</text>');
    expect(html).not.toContain('text-anchor="end">900</text>');
  });

  it("shows an empty state when there has never been visit collection", () => {
    const html = renderToStaticMarkup(<VisitLineChart report={{ ...report, range: "all", startDate: null, days: [] }} />);
    expect(html).toContain("尚无访问采集记录");
    expect(html).not.toContain("<svg");
  });

  it("keeps the count axis in integers for one recorded visit", () => {
    const html = renderToStaticMarkup(<VisitLineChart report={{ ...report,
      startDate: "2026-10-31", days: [{ date: "2026-10-31", pv: 1, uv: 1, pvStatus: "available", uvStatus: "available" }],
    }} />);
    expect(html).toContain('text-anchor="end">0</text>');
    expect(html).toContain('text-anchor="end">1</text>');
    expect(html).not.toMatch(/text-anchor="end">0\.[0-9]/);
  });

  it("includes years on the horizontal axis across different calendar years", () => {
    const html = renderToStaticMarkup(<VisitLineChart report={{ ...report, range: "all", startDate: "2025-10-31",
      days: [{ ...report.days[0], date: "2025-10-31" }, report.days[4]],
    }} />);
    expect(html).toMatch(/text-anchor="start">2025\/10\/31<\/text>/);
    expect(html).toMatch(/text-anchor="end">2026\/10\/31<\/text>/);
  });

  it("rejects stale range responses, invalid counts and discontinuous dates", () => {
    expect(readTrendResponse(report, "7")).toEqual(report);
    expect(() => readTrendResponse(report, "30")).toThrow();
    expect(() => readTrendResponse({ ...report, days: [{ ...report.days[0], uv: -1 }] }, "7")).toThrow();
    expect(() => readTrendResponse({ ...report, days: [report.days[0], report.days[2]] }, "7")).toThrow();
    expect(() => readTrendResponse({ ...report, days: [{ ...report.days[0], date: "2026-02-30" }] }, "7")).toThrow();
    expect(() => readTrendResponse({ ...report, days: [{ ...report.days[0], pvStatus: "okay" }] }, "7")).toThrow();
  });
});

"use client";

import { useState } from "react";
import type { UsageReport } from "@/modules/analytics/report";
import { VisitHeatmap } from "./VisitHeatmap";
import { VisitTrendPanel } from "./VisitTrend";
import styles from "../platform-admin.module.css";
import trendStyles from "./visit-trend.module.css";

export function VisitActivity({ heatmap }: { heatmap: UsageReport["heatmap"] }) {
  const [view, setView] = useState<"heatmap" | "line">("heatmap");
  const [range, setRange] = useState<"7" | "30" | "all">("7");
  const observed = heatmap.days.filter(day => day.views !== null);
  const total = observed.reduce((sum, day) => sum + (day.views ?? 0), 0);
  const controls = <div className={trendStyles.viewSwitch} role="group" aria-label="访问图表视图">
    <button type="button" aria-pressed={view === "heatmap"} onClick={() => setView("heatmap")}>热力图</button>
    <button type="button" aria-pressed={view === "line"} onClick={() => setView("line")}>折线图</button>
  </div>;
  return <section className={styles.heatmapSection} aria-labelledby="visit-activity-title">
    <div className={styles.sectionHeader}>
      <div><h2 id="visit-activity-title">{view === "heatmap" ? "访问日历" : "访问趋势"}</h2>
        <p className={styles.caption}>{view === "heatmap" ? "过去 365 天 · 每格代表一天" : "每日 PV 与 UV · 北京时间"}</p></div>
      <div className={trendStyles.headerActions}>{controls}
        {view === "heatmap" && observed.length > 0 && <p className={styles.heatmapTotal}>已记录 <strong>{new Intl.NumberFormat("zh-CN").format(total)}</strong> 次访问</p>}
      </div>
    </div>
    {view === "heatmap" ? <VisitHeatmap heatmap={heatmap} embedded /> : <>
    <div className={trendStyles.toolbar}>
      <div className={trendStyles.rangeSwitch} role="group" aria-label="折线图时间范围">
        {([["7", "最近 7 天"], ["30", "最近 30 天"], ["all", "全部"]] as const).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>)}
      </div>
      <div className={trendStyles.legend} aria-label="图例">
        <span><i className={trendStyles.pvSample} aria-hidden="true" />访问次数 PV</span>
        <span><i className={trendStyles.uvSample} aria-hidden="true" />去重人数 UV</span>
      </div>
    </div>
    <VisitTrendPanel key={range} range={range} />
    <p className={trendStyles.definition}>UV 按每天的员工账号和访客标识分别去重；每日 UV 不能相加作为时段去重人数。全部显示采集以来、最近 24 个月内的数据。</p>
    </>}
  </section>;
}

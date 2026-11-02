"use client";

import { useState } from "react";
import type { UsageReport } from "@/modules/analytics/report";
import { HeatmapLegend, HeatmapNotes, HeatmapTotal, VisitHeatmap } from "./VisitHeatmap";
import { VisitTrendPanel } from "./VisitTrend";
import styles from "../platform-admin.module.css";
import frame from "./activity-frame.module.css";
import controls from "./visit-trend.module.css";

const ranges = [["7", "最近 7 天"], ["30", "最近 30 天"], ["all", "全部"]] as const;

export function VisitActivity({ heatmap }: { heatmap: UsageReport["heatmap"] }) {
  const [view, setView] = useState<"heatmap" | "trend">("heatmap");
  const [hasOpenedTrend, setHasOpenedTrend] = useState(false);
  const [range, setRange] = useState<(typeof ranges)[number][0]>("7");
  const isCalendar = view === "heatmap";

  return <section className={`${styles.heatmapSection} ${frame.card}`} aria-labelledby="visit-activity-title" data-visit-card>
    <div className={frame.header} data-visit-header>
      <div>
        <h2 id="visit-activity-title">{isCalendar ? "访问日历" : "访问趋势"}</h2>
        <p className={styles.caption}>{isCalendar ? "过去 365 天 · 每格代表一天" : "每日访问次数与去重人数"}</p>
      </div>
      <div className={controls.viewSwitch} role="group" aria-label="访问图表视图">
        <button type="button" aria-pressed={isCalendar} onClick={() => setView("heatmap")}>热力图</button>
        <button type="button" aria-pressed={!isCalendar} onClick={() => { setHasOpenedTrend(true); setView("trend"); }}>趋势图</button>
      </div>
    </div>

    <div className={frame.toolbar} data-visit-toolbar>
      <div className={frame.scope}>
        {isCalendar ? <HeatmapTotal heatmap={heatmap} /> :
          <div className={controls.rangeSwitch} role="group" aria-label="趋势图时间范围">
            {ranges.map(([value, label]) => <button type="button" key={value}
              aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>)}
          </div>}
      </div>
      <div className={frame.legend}>
        {isCalendar ? <HeatmapLegend heatmap={heatmap} /> :
          <div className={controls.legend} role="group" aria-label="趋势图图例">
            <span><i className={controls.pvSample} aria-hidden="true" />访问次数 PV</span>
            <span><i className={controls.uvSample} aria-hidden="true" />去重人数 UV</span>
          </div>}
      </div>
    </div>

    <div className={frame.panel} hidden={!isCalendar}><VisitHeatmap heatmap={heatmap} embedded /></div>
    {hasOpenedTrend && <div className={frame.panel} hidden={isCalendar}><VisitTrendPanel key={range} range={range} /></div>}

    <details className={frame.details} data-visit-details>
      <summary>图表说明与统计口径</summary>
      <p>日期按北京时间统计。点按图表可查看当日读数。日历用上下键逐日、左右键逐周查看，趋势图用左右键逐日查看。</p>
      <HeatmapNotes heatmap={heatmap} />
      <p>趋势图的日均线取所选范围内截至昨天、PV 记录完整的日期计算。零次访问计入平均。今天显示截至当前的访问次数。</p>
      <p>趋势图的 PV 为每天的访问次数，UV 按每天的员工账号和访客标识分别去重。每日 UV 相加不能用于计算时段去重人数。「全部」显示开始采集以来、最近 24 个月内的记录。缺少数据的日期留空，部分记录会在当日读数中注明。</p>
    </details>
  </section>;
}

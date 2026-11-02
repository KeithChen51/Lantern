"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { UsageReport, HeatmapDay } from "@/modules/analytics/report";
import styles from "../platform-admin.module.css";
import frame from "./activity-frame.module.css";

const numberFormat = new Intl.NumberFormat("zh-CN");
const DAY = 86_400_000;

export function heatmapLevel(views: number | null, maximum: number) {
  if (views === null) return "unknown";
  if (views === 0) return "zero";
  return String(Math.max(1, Math.min(4, Math.ceil(views / Math.max(maximum, 1) * 4))));
}

export function heatmapScale(maximum: number) {
  const levels = [{ level: "zero", minimum: 0, maximum: 0 }];
  for (let level = 1; level <= 4; level++) {
    const minimum = Math.floor((level - 1) * maximum / 4) + 1;
    const upper = Math.floor(level * maximum / 4);
    if (minimum <= upper) levels.push({ level: String(level), minimum, maximum: upper });
  }
  return levels;
}

export function calendarWeeks(days: HeatmapDay[]) {
  if (!days.length) return [];
  const first = new Date(days[0].date + "T00:00:00Z");
  const padding = (first.getUTCDay() + 6) % 7;
  const cells: Array<HeatmapDay | null> = [...Array<null>(padding).fill(null), ...days];
  const trailing = (7 - cells.length % 7) % 7;
  cells.push(...Array<null>(trailing).fill(null));
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

function dayValue(day: HeatmapDay) {
  if (day.views === null) return day.status === "unavailable" ? "暂时无法读取" : "尚未采集";
  return `${numberFormat.format(day.views)} 次访问${day.status === "partial" ? "（部分记录）" : ""}`;
}

type Heatmap = UsageReport["heatmap"];

export function HeatmapTotal({ heatmap }: { heatmap: Heatmap }) {
  const observed = heatmap.days.filter(day => day.views !== null);
  if (!observed.length) return <p className={styles.heatmapTotal}>尚无可用的访问次数</p>;
  const total = observed.reduce((sum, day) => sum + (day.views ?? 0), 0);
  return <p className={styles.heatmapTotal}>{heatmap.status === "partial" ? "至少已记录" : "已记录"} <strong>{numberFormat.format(total)}</strong> 次访问</p>;
}

export function HeatmapLegend({ heatmap }: { heatmap: Heatmap }) {
  const maximum = Math.max(0, ...heatmap.days.map(day => day.views ?? 0));
  return <div className={styles.calendarLegend} aria-label="每日已记录访问次数色阶">
    {heatmap.days.some(day => day.views !== null) && heatmapScale(maximum).map(({ level, minimum, maximum: upper }) => {
      const label = minimum === upper ? numberFormat.format(minimum) : `${numberFormat.format(minimum)}–${numberFormat.format(upper)}`;
      return <span className={styles.legendItem} key={level} title={`${label} 次已记录访问`}>
        <i className={styles.legendSquare} data-level={level} aria-hidden="true" /><span>{label}</span>
      </span>;
    })}
    <span className={styles.legendItem} title="未采集或暂时无法读取，不能视为零次访问"><i className={styles.legendSquare} data-level="unknown" aria-hidden="true" /><span>未采集／不可用</span></span>
  </div>;
}

export function HeatmapNotes({ heatmap }: { heatmap: Heatmap }) {
  return <>
    <p>日历色阶按已记录的单日最高访问次数分档。{heatmap.days.some(day => day.status === "partial") && "部分记录可能低于实际访问次数。"}</p>
    {heatmap.note && <p>{heatmap.note}</p>}
  </>;
}

export function VisitHeatmap({ heatmap, embedded = false }: { heatmap: UsageReport["heatmap"]; embedded?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [selected, setSelected] = useState(heatmap.days.length - 1);
  const weeks = calendarWeeks(heatmap.days);
  const maximum = Math.max(0, ...heatmap.days.map(day => day.views ?? 0));
  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    container.scrollLeft = container.scrollWidth;
    if (typeof ResizeObserver === "undefined") return;
    // Keep the selected date visible when rotating a phone or resizing the
    // window, without taking over ordinary horizontal scrolling.
    const observer = new ResizeObserver(() => {
      const selectedDay = container.querySelector<HTMLButtonElement>("button[data-selected]");
      if (!selectedDay || container.clientWidth === 0) return;
      const cell = selectedDay.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      const axisWidth = container.querySelector("[data-weekday-axis]")?.getBoundingClientRect().width ?? 0;
      if (cell.right > viewport.right) container.scrollLeft += cell.right - viewport.right + 4;
      else if (cell.left < viewport.left + axisWidth) container.scrollLeft -= viewport.left + axisWidth - cell.left + 4;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keyOffsets: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    const delta = keyOffsets[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(heatmap.days.length - 1, index + delta));
    setSelected(next);
    buttons.current[next]?.focus();
  }

  const current = heatmap.days[selected];
  const content = <>
    <div className={frame.plot} data-visit-plot>
      <div className={styles.calendarScroller} ref={scroller} role="region" aria-label="全年访问日历，可横向滚动">
        <div className={styles.calendar}>
          <div className={styles.weekLabels} data-weekday-axis aria-hidden="true"><span>一</span><span>三</span><span>五</span><span>日</span></div>
          <div className={styles.calendarWeeks}>
            {weeks.map((week, weekIndex) => {
              const monthStart = week.find(day => day?.date.endsWith("-01"));
              const firstDay = week.find(day => day !== null);
              const label = monthStart ?? (weekIndex === 0 ? firstDay : null);
              return <div className={styles.calendarWeek} key={firstDay?.date ?? weekIndex}>
                <span className={styles.monthLabel} aria-hidden="true">{label ? Number(label.date.slice(5, 7)) + "月" : ""}</span>
                {week.map((day, row) => {
                  if (!day) return <span className={styles.daySpacer} aria-hidden="true" key={row} />;
                  const index = Math.round((new Date(day.date + "T00:00:00Z").getTime() - new Date(heatmap.days[0].date + "T00:00:00Z").getTime()) / DAY);
                  const label = `${day.date.replaceAll("-", "/")}，${dayValue(day)}`;
                  return <button type="button" className={styles.calendarDay} key={day.date}
                    data-level={heatmapLevel(day.views, maximum)} data-selected={selected === index || undefined}
                    title={label} aria-label={label} tabIndex={selected === index ? 0 : -1}
                    ref={element => { buttons.current[index] = element; }}
                    onFocus={() => setSelected(index)} onClick={() => setSelected(index)} onKeyDown={event => move(event, index)} />;
                })}
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
    <div className={frame.readout} aria-live="polite" aria-atomic="true" data-visit-readout>
      {current ? <><strong>{current.date.replaceAll("-", "/")}</strong><span>{dayValue(current)}</span></> : "尚无访问记录"}
      <span className={frame.readoutMeta}>{heatmap.startDate.replaceAll("-", "/")} 至 {heatmap.endDate.replaceAll("-", "/")}</span>
    </div>
  </>;
  if (embedded) return content;
  return <section className={`${styles.heatmapSection} ${frame.card}`} aria-labelledby="visit-calendar-title">
    <div className={styles.sectionHeader}>
      <div><h2 id="visit-calendar-title">访问日历</h2><p className={styles.caption}>过去 365 天 · 每格代表一天</p></div>
      <HeatmapTotal heatmap={heatmap} />
    </div>
    <HeatmapLegend heatmap={heatmap} />
    {content}
    <HeatmapNotes heatmap={heatmap} />
  </section>;
}

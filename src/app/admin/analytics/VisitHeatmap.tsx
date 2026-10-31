"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { UsageReport, HeatmapDay } from "@/modules/analytics/report";
import styles from "../platform-admin.module.css";

const numberFormat = new Intl.NumberFormat("zh-CN");
const DAY = 86_400_000;

export function heatmapLevel(views: number | null, maximum: number) {
  if (views === null) return "unknown";
  if (views === 0) return "zero";
  return String(Math.max(1, Math.min(4, Math.ceil(views / Math.max(maximum, 1) * 4))));
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

function describeDay(day: HeatmapDay) {
  const date = day.date.replaceAll("-", "/");
  if (day.views === null) return `${date}，${day.status === "unavailable" ? "暂时无法读取" : "尚未采集"}`;
  return `${date}，${numberFormat.format(day.views)} 次访问${day.status === "partial" ? "（部分记录）" : ""}`;
}

export function VisitHeatmap({ heatmap }: { heatmap: UsageReport["heatmap"] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [selected, setSelected] = useState(heatmap.days.length - 1);
  const weeks = calendarWeeks(heatmap.days);
  const maximum = Math.max(1, ...heatmap.days.map(day => day.views ?? 0));
  const observed = heatmap.days.filter(day => day.views !== null);
  const total = observed.reduce((sum, day) => sum + (day.views ?? 0), 0);

  useEffect(() => {
    const container = scroller.current;
    if (container) container.scrollLeft = container.scrollWidth;
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
  return (
    <section className={styles.heatmapSection} aria-labelledby="visit-calendar-title">
      <div className={styles.sectionHeader}>
        <div><h2 id="visit-calendar-title">访问日历</h2><p className={styles.caption}>过去 365 天 · 每格代表一天</p></div>
        {observed.length > 0 && <p className={styles.heatmapTotal}>已记录 <strong>{numberFormat.format(total)}</strong> 次访问</p>}
      </div>
      <div className={styles.calendarScroller} ref={scroller} role="region" aria-label="全年访问日历，可横向滚动">
        <div className={styles.calendar}>
          <div className={styles.weekLabels} aria-hidden="true"><span>一</span><span>三</span><span>五</span><span>日</span></div>
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
                  return <button type="button" className={styles.calendarDay} key={day.date}
                    data-level={heatmapLevel(day.views, maximum)} data-selected={selected === index || undefined}
                    title={describeDay(day)} aria-label={describeDay(day)} tabIndex={selected === index ? 0 : -1}
                    ref={element => { buttons.current[index] = element; }}
                    onFocus={() => setSelected(index)} onClick={() => setSelected(index)} onKeyDown={event => move(event, index)} />;
                })}
              </div>;
            })}
          </div>
        </div>
      </div>
      <div className={styles.calendarFooter}>
        <p className={styles.dayDescription} aria-live="polite">{current ? describeDay(current) : "尚无访问记录"}</p>
        <div className={styles.calendarLegend} aria-label="访问次数由浅至深">
          <span>少</span>{["zero", "1", "2", "3", "4"].map(level => <i className={styles.legendSquare} data-level={level} key={level} aria-hidden="true" />)}<span>多</span>
          <i className={styles.legendSquare} data-level="unknown" aria-hidden="true" /><span>未采集</span>
        </div>
      </div>
      {heatmap.note && <p className={styles.note}>{heatmap.note}</p>}
    </section>
  );
}

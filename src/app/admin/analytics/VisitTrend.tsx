"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { authFetch, AuthRequestError } from "@/components/auth/auth-fetch";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import type { VisitTrend } from "@/modules/analytics/visit-trend";
import styles from "./trend-area.module.css";
import frameStyles from "./activity-frame.module.css";

type TrendDay = VisitTrend["days"][number];
type Range = VisitTrend["range"];
type LoadState = { phase: "loading" } | { phase: "ready"; report: VisitTrend } | { phase: "error"; message: string };
const numberFormat = new Intl.NumberFormat("zh-CN");
const compactNumber = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const DAY = 86_400_000;
const STATUSES = new Set(["available", "partial", "not_collected", "unavailable"]);
const validCount = (value: unknown) => value === null || typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;

/** Only numerical daily aggregates enter the chart; malformed responses use the retry state. */
export function readTrendResponse(input: unknown, range: Range): VisitTrend {
  if (!input || typeof input !== "object") throw new Error("Invalid trend response");
  const report = input as VisitTrend;
  if (report.range !== range || !validDate(report.endDate) || report.startDate !== null && !validDate(report.startDate)
    || !Array.isArray(report.days) || report.days.length > 733) throw new Error("Invalid trend response");
  for (let index = 0; index < report.days.length; index++) {
    const day = report.days[index];
    if (!day || !validDate(day.date) || !validCount(day.pv) || !validCount(day.uv)
      || !STATUSES.has(day.pvStatus) || !STATUSES.has(day.uvStatus)
      || index > 0 && +new Date(day.date) - +new Date(report.days[index - 1].date) !== DAY
      || day.date > report.endDate || report.startDate !== null && day.date < report.startDate) throw new Error("Invalid trend response");
  }
  return report;
}

/** A missing day starts a new segment, so the drawing never implies observed continuity. */
export function trendSegments(days: TrendDay[], metric: "pv" | "uv") {
  const segments: Array<Array<{ index: number; value: number }>> = [];
  let current: Array<{ index: number; value: number }> = [];
  for (const [index, day] of days.entries()) {
    const value = day[metric];
    const status = metric === "pv" ? day.pvStatus : day.uvStatus;
    if (value === null || status === "unavailable" || status === "not_collected") {
      if (current.length) segments.push(current);
      current = [];
    } else current.push({ index, value });
  }
  if (current.length) segments.push(current);
  return segments;
}

export function describeTrendValue(value: number | null, status: TrendDay["pvStatus"]) {
  if (status === "unavailable") return "暂时无法读取";
  if (value === null || status === "not_collected") return "暂无完整记录";
  return numberFormat.format(value) + (status === "partial" ? "（部分记录）" : "");
}

function TrendRequest({ range, retry }: { range: Range; retry: () => void }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const session = useEmployeeSession();
  const expiresAt = session?.expiresAt;
  useEffect(() => {
    const controller = new AbortController();
    let expiry: number | undefined;
    if (expiresAt !== undefined) expiry = window.setTimeout(() => {
      controller.abort();
      setState({ phase: "error", message: "登录已失效，请重新登录后查看。" });
    }, Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)));
    void (async () => {
      try {
        const response = await authFetch("/api/admin/analytics/trend?range=" + range, { signal: controller.signal });
        if (!response.ok) throw new Error("Trend unavailable");
        const report = readTrendResponse(await response.json(), range);
        if (!controller.signal.aborted) setState({ phase: "ready", report });
      } catch (error) {
        if (!controller.signal.aborted) setState({ phase: "error", message: error instanceof AuthRequestError && [401, 403].includes(error.status)
          ? error.message : "访问趋势暂不可用，请重试。" });
      }
    })();
    return () => { controller.abort(); if (expiry !== undefined) window.clearTimeout(expiry); };
  }, [range, expiresAt]);
  if (state.phase === "loading") return <>
    <div className={frameStyles.plot} data-visit-plot><p className={styles.state} role="status" aria-live="polite">正在加载访问趋势…</p></div>
    <div className={frameStyles.readout} data-visit-readout><span className={frameStyles.readoutMeta}>正在读取每日 PV 与 UV</span></div>
  </>;
  if (state.phase === "error") return <>
    <div className={frameStyles.plot} data-visit-plot><p className={styles.state} role="alert">{state.message}</p></div>
    <div className={frameStyles.readout} data-visit-readout><button type="button" className={styles.retry} onClick={retry}>重新加载趋势</button></div>
  </>;
  return <VisitLineChart report={state.report} retry={retry} />;
}

export function VisitTrendPanel({ range }: { range: Range }) {
  const [attempt, setAttempt] = useState(0);
  return <TrendRequest key={attempt} range={range} retry={() => setAttempt(value => value + 1)} />;
}

export function VisitLineChart({ report, retry }: { report: VisitTrend; retry?: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [selected, setSelected] = useState(report.days.length - 1);
  const descriptionId = useId();
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      const measured = Math.round(element.getBoundingClientRect().width);
      if (measured > 0) setWidth(measured);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  if (!report.days.length) return <>
    <div className={frameStyles.plot} data-visit-plot><p className={styles.state}>尚无访问采集记录，启用采集后可查看趋势。</p></div>
    <div className={frameStyles.readout} data-visit-readout><span className={frameStyles.readoutMeta}>每日 PV 与 UV · 北京时间</span></div>
  </>;
  const left = 42, right = 16, top = 26, bottom = 156, height = 192;
  const chartWidth = width - left - right;
  const series = (["pv", "uv"] as const).map(metric => ({ metric, segments: trendSegments(report.days, metric) }));
  const values = series.flatMap(item => item.segments.flatMap(segment => segment.map(point => point.value)));
  const maximum = Math.max(1, ...values);
  const targetStep = Math.max(1, maximum / 4);
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const tickStep = [1, 2, 2.5, 5, 10].map(value => value * magnitude).filter(Number.isInteger)
    .reduce((best, step) => Math.abs(step - targetStep) < Math.abs(best - targetStep) ? step : best);
  const intervals = Math.ceil(maximum / tickStep);
  const ceiling = tickStep * intervals;
  const x = (index: number) => report.days.length === 1 ? left + chartWidth / 2 : left + index / (report.days.length - 1) * chartWidth;
  const y = (value: number) => bottom - value / ceiling * (bottom - top);
  const day = report.days[Math.max(0, Math.min(selected, report.days.length - 1))];
  const currentIndex = report.days.indexOf(day);
  const selectFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) / bounds.width * width;
    setSelected(Math.max(0, Math.min(report.days.length - 1, Math.round((position - left) / chartWidth * (report.days.length - 1)))));
  };
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault(); setSelected(event.key === "Home" ? 0 : report.days.length - 1);
    } else if (Object.hasOwn(offsets, event.key)) {
      event.preventDefault(); setSelected(value => Math.max(0, Math.min(report.days.length - 1, value + offsets[event.key])));
    }
  };
  const tickCount = width < 480 ? 3 : report.days.length === 7 ? 7 : 5;
  const showYear = report.startDate?.slice(0, 4) !== report.endDate.slice(0, 4);
  const ticks = Array.from(new Set(Array.from({ length: tickCount }, (_, index) => Math.round(index / (tickCount - 1) * (report.days.length - 1)))));
  const missing = report.days.some(item => item.pv === null || item.uv === null || item.pvStatus === "unavailable" || item.uvStatus === "unavailable");
  const partial = report.days.some(item => item.pvStatus === "partial" || item.uvStatus === "partial");
  const pvPoints = series[0].segments.flat();
  const peak = pvPoints.reduce<(typeof pvPoints)[number] | null>((best, point) => !best || point.value > best.value ? point : best, null);
  const showPeak = peak && peak.value > 0 && pvPoints.some(point => point.value < peak.value);
  const stemStep = Math.max(1, Math.ceil(report.days.length / Math.max(1, Math.floor(chartWidth / 9))));
  return <>
    <div className={frameStyles.plot} data-visit-plot>
    <div ref={frame} className={styles.chartFrame} role="group" tabIndex={0}
      aria-label="每日 PV 与 UV 趋势图，左右方向键逐日查看，Home 和 End 跳到首尾"
      aria-describedby={descriptionId} onKeyDown={move}>
      <svg viewBox={"0 0 " + width + " " + height} width="100%" height={height} role="img" aria-label="PV 浅琥珀面积与实线圆点、UV 虚线方点的每日访问趋势"
        onPointerMove={event => { if (event.pointerType !== "touch" || event.buttons) selectFromPointer(event); }}
        onPointerDown={event => { frame.current?.focus({ preventScroll: true }); selectFromPointer(event); }}>
        {Array.from({ length: intervals + 1 }, (_, index) => {
          const value = tickStep * index;
          const axisY = y(value);
          return <g key={index} className={styles.axis}>
            <line x1={left} x2={width - right} y1={axisY} y2={axisY} />
            <text x={left - 10} y={axisY + 4} textAnchor="end">{compactNumber.format(value)}</text>
          </g>;
        })}
        {ticks.map(index => <text key={index} x={x(index)} y={height - 12} className={styles.axisLabel}
          textAnchor={index === 0 ? "start" : index === report.days.length - 1 ? "end" : "middle"}>{(showYear ? report.days[index].date : report.days[index].date.slice(5)).replaceAll("-", "/")}</text>)}
        <g className={styles.pvArea} aria-hidden="true">
          {series[0].segments.filter(segment => segment.length > 1).map((segment, index) => <path key={index} data-mark="pv-area"
            d={`M${x(segment[0].index)},${bottom} L${segment.map(point => `${x(point.index)},${y(point.value)}`).join(" L")} L${x(segment[segment.length - 1].index)},${bottom} Z`} />)}
        </g>
        <g className={styles.pvStems} aria-hidden="true">
          {pvPoints.filter(point => point.index % stemStep === 0).map(point => <line key={point.index} x1={x(point.index)} x2={x(point.index)} y1={bottom} y2={y(point.value)} />)}
        </g>
        {series.map(({ metric, segments }) => <g key={metric} className={metric === "pv" ? styles.pvLine : styles.uvLine}>
          {segments.map((segment, index) => segment.length === 1
            ? metric === "pv" ? <circle key={index} cx={x(segment[0].index)} cy={y(segment[0].value)} r={3} />
              : <rect key={index} x={x(segment[0].index) - 3} y={y(segment[0].value) - 3} width={6} height={6} />
            : <path key={index} data-mark={metric + "-line"} d={segment.map((point, pointIndex) => (pointIndex ? "L" : "M") + x(point.index).toFixed(2) + "," + y(point.value).toFixed(2)).join(" ")} />)}
        </g>)}
        {showPeak && <g className={styles.peak} data-mark="pv-peak">
          <title>{`${report.days[peak.index].date} · 已记录最高 ${numberFormat.format(peak.value)} 次访问`}</title>
          <line x1={x(peak.index)} x2={x(peak.index)} y1={y(peak.value)} y2={bottom} />
          <circle cx={x(peak.index)} cy={y(peak.value)} r={4} />
          <text x={Math.max(left + 4, Math.min(width - right - 4, x(peak.index)))} y={Math.max(14, y(peak.value) - 10)}
            textAnchor={x(peak.index) < left + 30 ? "start" : x(peak.index) > width - right - 30 ? "end" : "middle"}>{compactNumber.format(peak.value)} 次</text>
        </g>}
        <line className={styles.crosshair} x1={x(currentIndex)} x2={x(currentIndex)} y1={top} y2={bottom} />
        {day.pv !== null && !["unavailable", "not_collected"].includes(day.pvStatus) && <circle className={styles.pvPoint} cx={x(currentIndex)} cy={y(day.pv)} r={4} />}
        {day.uv !== null && !["unavailable", "not_collected"].includes(day.uvStatus) && <rect className={styles.uvPoint} x={x(currentIndex) - 5} y={y(day.uv) - 5} width={10} height={10} />}
      </svg>
    </div>
    </div>
    <div id={descriptionId} className={frameStyles.readout} data-visit-readout aria-live="polite" aria-atomic="true">
      <strong>{day.date.replaceAll("-", "/")}</strong>
      <span className={styles.pvReadout}>PV <b>{describeTrendValue(day.pv, day.pvStatus)}</b></span>
      <span className={styles.uvReadout}>UV <b>{describeTrendValue(day.uv, day.uvStatus)}</b></span>
      <span className={frameStyles.readoutMeta}>
        <span>{report.startDate?.replaceAll("-", "/")} 至 {report.endDate.replaceAll("-", "/")}</span>
        {retry && report.days.some(item => item.pvStatus === "unavailable" || item.uvStatus === "unavailable") &&
          <button type="button" className={styles.retry} onClick={retry} aria-label="重新加载趋势" title="部分日期无法读取，重新加载趋势">重试</button>}
      </span>
      <span className={styles.visuallyHidden}>悬停或点按查看日期，键盘方向键可逐日切换。{missing && " 缺少完整记录的日期留空。"}{partial && " 部分记录已在日期明细中标注。"}</span>
    </div>
  </>;
}

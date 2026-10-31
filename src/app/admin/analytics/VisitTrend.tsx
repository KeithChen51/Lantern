"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { authFetch, AuthRequestError } from "@/components/auth/auth-fetch";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import type { VisitTrend } from "@/modules/analytics/visit-trend";
import styles from "./visit-trend.module.css";

type TrendDay = VisitTrend["days"][number];
type Range = VisitTrend["range"];
type LoadState = { phase: "loading" } | { phase: "ready"; report: VisitTrend } | { phase: "error"; message: string };
const numberFormat = new Intl.NumberFormat("zh-CN");
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
  if (state.phase === "loading") return <div className={styles.state} role="status" aria-live="polite">正在加载访问趋势…</div>;
  if (state.phase === "error") return <div className={styles.state}><p role="alert">{state.message}</p><button type="button" className={styles.retry} onClick={retry}>重新加载趋势</button></div>;
  return <><VisitLineChart report={state.report} />
    {state.report.days.some(day => day.pvStatus === "unavailable" || day.uvStatus === "unavailable")
      && <button type="button" className={styles.retry} onClick={retry}>重新加载趋势</button>}</>;
}

export function VisitTrendPanel({ range }: { range: Range }) {
  const [attempt, setAttempt] = useState(0);
  return <div className={styles.panel}>
    <TrendRequest key={attempt} range={range} retry={() => setAttempt(value => value + 1)} />
  </div>;
}

export function VisitLineChart({ report }: { report: VisitTrend }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [selected, setSelected] = useState(report.days.length - 1);
  const descriptionId = useId();
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  if (!report.days.length) return <p className={styles.state}>尚无访问采集记录，启用采集后可查看趋势。</p>;
  const left = 48, right = 16, top = 20, bottom = 226, height = 264;
  const chartWidth = width - left - right;
  const values = report.days.flatMap(day => [day.pv ?? 0, day.uv ?? 0]);
  const maximum = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const tickStep = Math.max(1, ([1, 2, 5, 10].find(value => value * magnitude >= maximum / 4) ?? 10) * magnitude);
  const ceiling = tickStep * 4;
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
  const tickCount = width < 480 ? 3 : 5;
  const showYear = report.startDate?.slice(0, 4) !== report.endDate.slice(0, 4);
  const ticks = Array.from(new Set(Array.from({ length: tickCount }, (_, index) => Math.round(index / (tickCount - 1) * (report.days.length - 1)))));
  const missing = report.days.some(item => item.pv === null || item.uv === null || item.pvStatus === "unavailable" || item.uvStatus === "unavailable");
  const partial = report.days.some(item => item.pvStatus === "partial" || item.uvStatus === "partial");
  return <>
    <p className={styles.period}>{report.startDate?.replaceAll("-", "/")} 至 {report.endDate.replaceAll("-", "/")}</p>
    <div ref={frame} className={styles.chartFrame} role="group" tabIndex={0}
      aria-label="每日 PV 与 UV 折线图，左右方向键逐日查看，Home 和 End 跳到首尾"
      aria-describedby={descriptionId} onKeyDown={move}>
      <svg viewBox={"0 0 " + width + " " + height} width="100%" height={height} role="img" aria-label="PV 实线与 UV 虚线的每日访问趋势"
        onPointerMove={event => { if (event.pointerType !== "touch" || event.buttons) selectFromPointer(event); }}
        onPointerDown={event => { frame.current?.focus({ preventScroll: true }); selectFromPointer(event); }}>
        {Array.from({ length: 5 }, (_, index) => {
          const value = ceiling * index / 4;
          const axisY = y(value);
          return <g key={index} className={styles.axis}>
            <line x1={left} x2={width - right} y1={axisY} y2={axisY} />
            <text x={left - 10} y={axisY + 4} textAnchor="end">{new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text>
          </g>;
        })}
        {ticks.map(index => <text key={index} x={x(index)} y={height - 12} className={styles.axisLabel}
          textAnchor={index === 0 ? "start" : index === report.days.length - 1 ? "end" : "middle"}>{(showYear ? report.days[index].date : report.days[index].date.slice(5)).replaceAll("-", "/")}</text>)}
        {(["pv", "uv"] as const).map(metric => <g key={metric} className={metric === "pv" ? styles.pvLine : styles.uvLine}>
          {trendSegments(report.days, metric).map((segment, index) => segment.length === 1
            ? <circle key={index} cx={x(segment[0].index)} cy={y(segment[0].value)} r={3} />
            : <path key={index} d={segment.map((point, pointIndex) => (pointIndex ? "L" : "M") + x(point.index).toFixed(2) + "," + y(point.value).toFixed(2)).join(" ")} />)}
        </g>)}
        <line className={styles.crosshair} x1={x(currentIndex)} x2={x(currentIndex)} y1={top} y2={bottom} />
        {day.pv !== null && !["unavailable", "not_collected"].includes(day.pvStatus) && <circle className={styles.pvPoint} cx={x(currentIndex)} cy={y(day.pv)} r={4} />}
        {day.uv !== null && !["unavailable", "not_collected"].includes(day.uvStatus) && <circle className={styles.uvPoint} cx={x(currentIndex)} cy={y(day.uv)} r={4} />}
      </svg>
    </div>
    <div id={descriptionId} className={styles.readout} aria-live="polite" aria-atomic="true">
      <strong>{day.date.replaceAll("-", "/")}</strong>
      <span>PV <b>{describeTrendValue(day.pv, day.pvStatus)}</b></span>
      <span>UV <b>{describeTrendValue(day.uv, day.uvStatus)}</b></span>
    </div>
    <p className={styles.help}>悬停或点按查看日期，键盘方向键可逐日切换。{missing && " 缺少完整记录的日期留空。"}{partial && " 部分记录已在日期明细中标注。"}</p>
  </>;
}

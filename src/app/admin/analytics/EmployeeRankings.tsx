"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import { authFetch } from "@/components/auth/auth-fetch";
import type { EmployeeRankingResult } from "@/modules/analytics/employee-rankings";
import styles from "./employee-rankings.module.css";

type Props = { period: { startDate: string; endDate: string } };
type RankingState =
  | { phase: "loading" }
  | { phase: "hidden" }
  | { phase: "expired" }
  | { phase: "error"; message: string }
  | { phase: "ready"; result: EmployeeRankingResult };
const format = new Intl.NumberFormat("zh-CN");

export function EmployeeRankings({ period }: Props) {
  const session = useEmployeeSession();
  const canView = session && session.kind !== "guest"
    && session.capabilities.includes("analytics:summary") && Number.isFinite(session.expiresAt) && session.expiresAt > 0;
  return (
    <section className={styles.section} aria-labelledby="employee-rankings-heading">
      <div className={styles.heading}>
        <h2 id="employee-rankings-heading">员工榜单</h2>
        <span>Top 10</span>
      </div>
      <p className={styles.description}>按上方所选时段展示员工使用情况。</p>
      {canView
        ? <RankingData key={`${session.user.id}:${session.expiresAt}:${period.startDate}:${period.endDate}`}
            period={period} expiresAt={session.expiresAt} />
        : <p className={styles.description}>请使用有效的平台管理员账号查看员工榜单。</p>}
    </section>
  );
}

function RankingData({ period, expiresAt }: Props & { expiresAt: number }) {
  const [state, setState] = useState<RankingState>({ phase: "loading" });
  const retry = useRef<() => void>(() => undefined);
  useEffect(() => {
    let active = true;
    let needsLoad = true;
    let request: AbortController | null = null;
    let scheduled: number | undefined;
    let expiry: number | undefined;

    function clearResults(phase: "hidden" | "expired") {
      if (scheduled !== undefined) window.clearTimeout(scheduled);
      scheduled = undefined;
      request?.abort();
      request = null;
      needsLoad = true;
      setState({ phase });
    }

    async function load() {
      scheduled = undefined;
      if (!active || document.visibilityState !== "visible" || request || !needsLoad) return;
      if (Date.now() >= expiresAt) { clearResults("expired"); return; }
      const controller = new AbortController();
      request = controller;
      needsLoad = false;
      setState({ phase: "loading" });
      try {
        const response = await authFetch("/api/admin/analytics/rankings", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: period.startDate, end: period.endDate }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("员工榜单暂不可用。");
        const result = await response.json() as EmployeeRankingResult;
        if (result.period?.startDate !== period.startDate || result.period?.endDate !== period.endDate) {
          throw new Error("员工榜单时段不匹配。");
        }
        if (active && !controller.signal.aborted && document.visibilityState === "visible" && Date.now() < expiresAt) {
          setState({ phase: "ready", result });
        }
      } catch {
        if (active && !controller.signal.aborted) {
          setState({ phase: "error", message: "员工榜单加载失败，请重试。若权限已变化，请刷新页面。" });
        }
      } finally {
        if (request === controller) request = null;
      }
    }

    function scheduleLoad() {
      if (Date.now() >= expiresAt) { clearResults("expired"); return; }
      if (document.visibilityState === "visible" && needsLoad && scheduled === undefined && !request) {
        // Coalesce initial mount, Strict Mode and restore events into one audited read.
        scheduled = window.setTimeout(() => { void load(); }, 0);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") clearResults("hidden");
      else scheduleLoad();
    }
    function onPageHide() { flushSync(() => clearResults("hidden")); }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        flushSync(() => clearResults("hidden"));
        scheduleLoad();
      }
    }
    function checkExpiry() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) clearResults("expired");
      else expiry = window.setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    }

    retry.current = () => { needsLoad = true; scheduleLoad(); };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    checkExpiry();
    scheduleLoad();
    return () => {
      active = false;
      request?.abort();
      if (scheduled !== undefined) window.clearTimeout(scheduled);
      if (expiry !== undefined) window.clearTimeout(expiry);
      retry.current = () => undefined;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [period.startDate, period.endDate, expiresAt]);

  if (state.phase === "expired") return <p role="status" className={styles.description}>登录已失效，请重新登录后查看员工榜单。</p>;
  if (state.phase === "hidden") return <p role="status" className={styles.description}>返回此页面后将更新员工榜单。</p>;
  if (state.phase === "loading") return <p role="status" className={styles.loading}>正在加载员工榜单…</p>;
  if (state.phase === "error") return <div className={styles.recovery}>
    <p role="alert" className={styles.error}>{state.message}</p>
    <button type="button" className={styles.retry} onClick={() => retry.current()}>重新加载员工榜单</button>
  </div>;
  const { result } = state;
  return <div className={styles.tables}>
        <section aria-labelledby="employee-visit-top">
          <h3 id="employee-visit-top">访问最多的 Top 10 员工</h3>
          {result.visits.rows.length > 0 ? <table>
            <thead><tr><th scope="col">排名</th><th scope="col">员工</th><th scope="col">访问次数</th></tr></thead>
            <tbody>{result.visits.rows.map(row => <tr key={row.rank}><td>{row.rank}</td><th scope="row">{row.employee}</th><td>{format.format(row.visits)}</td></tr>)}</tbody>
          </table> : <p className={styles.empty}>所选时段暂无可展示的员工访问记录。</p>}
          <p className={styles.note}>{result.visits.note}</p>
        </section>
        <section aria-labelledby="employee-ai-top">
          <h3 id="employee-ai-top">AI 对话最多的 Top 10 员工</h3>
          {result.ai.rows.length > 0 ? <table>
            <thead><tr><th scope="col">排名</th><th scope="col">员工</th><th scope="col">对话</th><th scope="col">轮次</th></tr></thead>
            <tbody>{result.ai.rows.map(row => <tr key={row.rank}><td>{row.rank}</td><th scope="row">{row.employee}</th><td>{format.format(row.conversations)}</td><td>{format.format(row.turns)}</td></tr>)}</tbody>
          </table> : <p className={styles.empty}>所选时段暂无可展示的员工 AI 对话记录。</p>}
          <p className={styles.note}>{result.ai.note}</p>
        </section>
      </div>;
}

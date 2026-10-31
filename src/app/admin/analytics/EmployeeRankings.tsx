"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import { authFetch } from "@/components/auth/auth-fetch";
import type { EmployeeRankingResult } from "@/modules/analytics/employee-rankings";
import styles from "./employee-rankings.module.css";

type Props = { period: { startDate: string; endDate: string }; canView: boolean };
const format = new Intl.NumberFormat("zh-CN");

export function EmployeeRankings({ period, canView }: Props) {
  const session = useEmployeeSession();
  return (
    <section className={styles.section} aria-labelledby="employee-rankings-heading">
      <div className={styles.heading}>
        <h2 id="employee-rankings-heading">员工榜单</h2>
        <span>Top 10</span>
      </div>
      {canView && session && session.kind !== "guest"
        ? <RankingQuery key={`${session.user.id}:${period.startDate}:${period.endDate}`} period={period} expiresAt={session.expiresAt} />
        : <p className={styles.description}>查看员工榜单需要平台负责人专项授权。</p>}
    </section>
  );
}

function RankingQuery({ period, expiresAt }: Pick<Props, "period"> & { expiresAt: number }) {
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState<EmployeeRankingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    function clearResults() {
      request.current?.abort();
      setResult(null);
      setPurpose("");
      setError("");
      setBusy(false);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") clearResults();
    }
    window.addEventListener("pagehide", clearResults);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const expiry = window.setTimeout(clearResults, Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)));
    return () => {
      request.current?.abort();
      window.clearTimeout(expiry);
      window.removeEventListener("pagehide", clearResults);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [expiresAt]);

  async function query(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setResult(null);
    setError("");
    setBusy(true);
    try {
      const response = await authFetch("/api/admin/analytics/rankings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: period.startDate, end: period.endDate, purpose }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("员工榜单暂不可用，请核对日期和查询事由后重试。");
      const data = await response.json() as EmployeeRankingResult;
      if (!controller.signal.aborted) setResult(data);
    } catch {
      if (!controller.signal.aborted) setError("员工榜单查询失败，请核对授权和查询事由后重试。");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <form className={styles.query} onSubmit={query}>
        <label htmlFor="employee-ranking-purpose">查询事由</label>
        <div className={styles.controls}>
          <input id="employee-ranking-purpose" name="purpose" value={purpose} onChange={event => setPurpose(event.target.value)}
            minLength={4} maxLength={256} required placeholder="例如核对本周推广使用情况" autoComplete="off" />
          <button type="submit" disabled={busy || purpose.trim().length < 4}>{busy ? "正在查询…" : "查询员工榜单"}</button>
        </div>
        <p className={styles.description}>按上方所选时段查询，操作将留审计记录。</p>
      </form>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {result && <div className={styles.tables}>
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
      </div>}
    </>
  );
}


"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReportPeriod } from "@/modules/analytics/report-period";
import styles from "../platform-admin.module.css";

export function ReportPeriodFilter({ period, today }: { period: ReportPeriod; today: string }) {
  const [custom, setCustom] = useState(period.preset === "custom");
  return <div className={styles.periodFilter}>
    <nav className={styles.periodNav} aria-label="统计时间范围">
      <Link href="/admin/analytics?preset=week" onClick={() => setCustom(false)} aria-current={!custom && period.preset === "week" ? "page" : undefined}>本周</Link>
      <Link href="/admin/analytics?preset=month" onClick={() => setCustom(false)} aria-current={!custom && period.preset === "month" ? "page" : undefined}>本月</Link>
      <button type="button" aria-expanded={custom} aria-controls="custom-report-period" data-active={custom || undefined} onClick={() => setCustom(value => !value)}>自定义</button>
    </nav>
    {custom && <form className={styles.customPeriod} action="/admin/analytics" method="get" id="custom-report-period">
      <input name="preset" type="hidden" value="custom" />
      <label>开始日期<input type="date" name="start" defaultValue={period.startDate} max={today} required /></label>
      <span aria-hidden="true">—</span>
      <label>结束日期<input type="date" name="end" defaultValue={period.endDate} max={today} required /></label>
      <button type="submit">查询</button>
    </form>}
  </div>;
}

import { headers } from "next/headers";
import Link from "next/link";
import { PageHeading } from "@/components/ui/PageHeading";
import { LhCallout } from "@/components/ui/lighthouse-primitives";
import { requireAnalyticsSummary } from "@/modules/auth/access";
import { getUsageReport } from "@/modules/analytics/report";
import { parseReportPeriod, shanghaiDate } from "@/modules/analytics/report-period";
import { hasEmployeeRankingGrant } from "@/modules/analytics/employee-rank-access";
import { PlatformAdminNav } from "../PlatformAdminNav";
import { VisitActivity } from "./VisitActivity";
import { ReportPeriodFilter } from "./ReportPeriodFilter";
import { UsageReportView } from "./UsageReportView";
import { EmployeeRankings } from "./EmployeeRankings";
import styles from "../platform-admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let principal;
  try { principal = await requireAnalyticsSummary(await headers()); } catch (error) {
    const forbidden = error && typeof error === "object" && "status" in error && error.status === 403;
    return <section role="alert"><h1>访问与使用</h1><p>{forbidden ? "当前账号没有访问与使用汇总权限。" : "登录或权限验证暂不可用，请稍后重试。"}</p><Link href="/">返回首页</Link></section>;
  }
  const now = new Date();
  const params = new URLSearchParams();
  for (const [key, entry] of Object.entries(await searchParams)) {
    if (entry === undefined) continue;
    const values = Array.isArray(entry) ? entry : [entry];
    for (const value of values) params.append(key, value);
  }
  let period;
  try { period = parseReportPeriod(params, now); } catch {
    return <><PlatformAdminNav active="analytics" canViewAnalytics /><div className={styles.page}>
      <PageHeading title="访问与使用" /><LhCallout tone="warning">请选择有效的统计日期。自定义范围须从开始日期至结束日期，最多 24 个月，且截止今天。</LhCallout>
      <Link className={styles.recovery} href="/admin/analytics?preset=week">查看本周统计</Link>
    </div></>;
  }
  let report;
  try { report = await getUsageReport(period, { now }); } catch { /* Render a bounded retry state without exposing source errors. */ }

  return <>
    <PlatformAdminNav active="analytics" canViewAnalytics />
    <div className={styles.page}>
      <PageHeading title="访问与使用" />
      {report ? <>
        <VisitActivity key={principal.userId} heatmap={report.heatmap} />
        <section className={styles.periodReport} aria-labelledby="period-report-title">
          <div className={styles.reportHeading}>
            <div>
              <h2 id="period-report-title">时段统计</h2>
              <p className={styles.caption}>{period.startDate} 至 {period.endDate} · 北京时间</p>
            </div>
            <ReportPeriodFilter key={period.preset + period.startDate + period.endDate} period={period} today={shanghaiDate(now)} />
          </div>
          <UsageReportView report={report} />
          <EmployeeRankings key={principal.userId + period.startDate + period.endDate} period={period} canView={hasEmployeeRankingGrant(principal)} />
        </section>
        <p className={styles.updatedAt}>更新于 {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(report.generatedAt))}</p>
      </> : <><LhCallout tone="warning">访问统计暂不可用，请重新加载页面。</LhCallout><a className={styles.recovery} href={`/admin/analytics?${params.toString()}`}>重新加载统计</a></>}
    </div>
  </>;
}

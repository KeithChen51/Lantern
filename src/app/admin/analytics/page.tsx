import { headers } from "next/headers";
import Link from "next/link";
import { PageHeading } from "@/components/ui/PageHeading";
import { LhCallout } from "@/components/ui/lighthouse-primitives";
import { requireAnalyticsSummary } from "@/modules/auth/access";
import { getAnalyticsSummary } from "@/modules/analytics/summary";
import { PlatformAdminNav } from "../PlatformAdminNav";
import { AnalyticsSummaryView } from "./AnalyticsSummaryView";
import styles from "../platform-admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({ searchParams }: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  try { await requireAnalyticsSummary(await headers()); } catch (error) {
    const forbidden = error && typeof error === "object" && "status" in error && error.status === 403;
    return <section role="alert"><h1>访问与使用</h1><p>{forbidden ? "当前账号没有访问与使用汇总权限。" : "登录或权限验证暂不可用，请稍后重试。"}</p><Link href="/">返回首页</Link></section>;
  }
  const days = (await searchParams).days === "30" ? 30 : 7;
  let summary;
  try { summary = await getAnalyticsSummary(days); } catch { /* Keep source failures and internal errors out of rendered output. */ }

  return (
    <>
      <PlatformAdminNav active="analytics" canViewAnalytics />
      <div className={styles.page}>
        <PageHeading title="访问与使用" description="查看平台使用汇总、知识供给和数据采集状态。" />
        <div className={styles.toolbar}>
          <nav className={styles.periodNav} aria-label="统计时间范围">
            <Link href="/admin/analytics?days=7" aria-current={days === 7 ? "page" : undefined}>最近 7 天</Link>
            <Link href="/admin/analytics?days=30" aria-current={days === 30 ? "page" : undefined}>最近 30 天</Link>
          </nav>
          <p className={styles.metadata}>日常查看汇总数据</p>
        </div>
        {summary ? <AnalyticsSummaryView summary={summary} /> : <><LhCallout tone="warning">访问统计暂不可用，请重新加载页面，持续失败时联系平台管理员。</LhCallout><a className={styles.recovery} href={`/admin/analytics?days=${days}`}>重新加载统计</a></>}
      </div>
    </>
  );
}

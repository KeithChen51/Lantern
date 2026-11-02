import type { UsageReport } from "@/modules/analytics/report";
import styles from "./usage-overview.module.css";

const count = new Intl.NumberFormat("zh-CN");
type OverviewReport = Pick<UsageReport, "period" | "visits" | "visitors">;

export function UsageOverview({ report }: { report: OverviewReport }) {
  const { period, visits, visitors } = report;
  const periodName = period.preset === "week" ? "本周" : period.preset === "month" ? "本月" : "自定义时段";
  const measuredUV = visitors.status === "available" || visitors.status === "partial";
  const measuredPV = (visits.status === "available" || visits.status === "partial") && visits.total !== null;
  // The report orders modules by views. Ties describe all leaders without singling one out.
  const first = visits.modules[0];
  const leaders = measuredPV && first && first.views > 0 ? visits.modules.filter(item => item.views === first.views) : [];
  const names = leaders.length > 2 ? `${leaders.length} 个模块` : leaders.map(item => item.label).join("、");
  return <div className={styles.overview}>
    <a href="#period-report-title" className={styles.period}
      aria-label={`查看${periodName}时段统计，${period.startDate} 至 ${period.endDate}`}>
      {periodName}概览<span aria-hidden="true"> ↓</span>
    </a>
    {measuredUV && visitors.employees !== null && visitors.guests !== null
      ? <span>
        去重访问 <strong>{count.format(visitors.employees + visitors.guests)}</strong>
        <span className={styles.detail}>（员工 {count.format(visitors.employees)} 人，访客 {count.format(visitors.guests)} 个标识）</span>
        {visitors.status === "partial" && <small>部分记录</small>}
      </span>
      : <span>去重访问{visitors.status === "not_collected" ? "尚未采集" : "暂不可用"}</span>}
    {leaders.length > 0 && <span>
      <strong>{names}</strong>{leaders.length > 1 ? "并列访问最多，各 " : "访问最多，"}{count.format(leaders[0].views)} 次
      {visits.status === "partial" && <small>部分记录</small>}
    </span>}
    {measuredPV && visits.total === 0 && <span>已记录的模块访问为零</span>}
  </div>;
}

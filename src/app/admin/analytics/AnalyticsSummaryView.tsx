import { LhCallout, LhPanel, LhStatusBadge } from "@/components/ui/lighthouse-primitives";
import type { AnalyticsSummary } from "@/modules/analytics/summary";
import styles from "../platform-admin.module.css";

const statusLabels = {
  available: "数据可用",
  unavailable: "读取暂不可用",
  not_collected: "尚未采集",
} as const;

const countFormat = new Intl.NumberFormat("zh-CN");

export function AnalyticsSummaryView({ summary }: { summary: AnalyticsSummary }) {
  return (
    <>
      <p className={styles.metadata}>
        统计日期 {summary.period.startDate} 至 {summary.period.endDate}（北京时间，含今日）。
        本次读取时间 {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(summary.period.generatedAt))}。
      </p>
      <div className={styles.sections}>
        {summary.sections.map(section => (
          <LhPanel key={section.id} className={styles.section} aria-labelledby={`analytics-${section.id}`}>
            <div className={styles.sectionHeader}>
              <h2 id={`analytics-${section.id}`}>{section.title}</h2>
              <LhStatusBadge tone={section.status === "available" ? "success" : section.status === "unavailable" ? "warning" : "neutral"}>
                {statusLabels[section.status]}
              </LhStatusBadge>
            </div>
            <p className={styles.description}>{section.description}</p>
            <dl className={styles.metrics}>
              {section.metrics.map(metric => (
                <div className={styles.metric} key={metric.key}>
                  <dt>{metric.label}</dt>
                  <dd>{section.status === "available" && metric.value !== null ? countFormat.format(metric.value) : "—"}<span className={styles.unit}>{metric.unit}</span></dd>
                </div>
              ))}
            </dl>
            {section.note && <p className={styles.note}>{section.note}</p>}
            <p className={styles.source}>数据来源 {section.source}</p>
          </LhPanel>
        ))}
      </div>
      <LhCallout tone="neutral">0 表示该来源没有记录；“—”表示尚未采集或本次读取失败。使用次数不能衡量个人绩效或问题解决情况。</LhCallout>
    </>
  );
}

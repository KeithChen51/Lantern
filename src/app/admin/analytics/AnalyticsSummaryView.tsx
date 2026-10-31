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
      <div className="mt-4">
        <LhCallout tone="neutral">本页展示已接入记录的汇总。尚未采集或暂不可用的数据显示为“—”，已采集且没有记录时显示 0。使用次数不代表问题解决或个人绩效。</LhCallout>
      </div>
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
    </>
  );
}

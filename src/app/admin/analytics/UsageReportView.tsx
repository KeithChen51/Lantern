import type { UsageReport, ReportStatus } from "@/modules/analytics/report";
import styles from "../platform-admin.module.css";
import reportStyles from "./usage-report.module.css";

const numberFormat = new Intl.NumberFormat("zh-CN");
const percentFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

function value(value: number | null) {
  return value === null ? "—" : numberFormat.format(value);
}
function coverageText(source: { status: ReportStatus; observedFrom: string | null; note: string }) {
  if (source.status === "partial" && source.observedFrom) {
    const start = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(source.observedFrom));
    return `已记录范围自 ${start} 起（北京时间）${source.note ? "；" + source.note : ""}`;
  }
  return sourceNote(source.status, source.note);
}
function sourceNote(status: ReportStatus, note: string) {
  if (status === "unavailable") return note || "数据暂时无法读取，请重新加载。";
  if (status === "not_collected") return note || "所选时段尚未采集。";
  return note;
}

export function UsageReportView({ report }: { report: UsageReport }) {
  const people = report.visitors.employees === null || report.visitors.guests === null
    ? null : report.visitors.employees + report.visitors.guests;
  const moduleSourceAvailable = report.visits.status === "available" || report.visits.status === "partial";
  const modules = moduleSourceAvailable ? [...report.visits.modules].sort((a, b) => b.views - a.views) : [];
  const total = report.visits.total;
  const departmentSourceAvailable = report.departments.status === "available" || report.departments.status === "partial";
  const departments = departmentSourceAvailable ? [...report.departments.items].sort((a, b) => b.views - a.views) : [];
  const departmentMaximum = Math.max(0, ...departments.map(item => item.views));
  const aiNote = coverageText(report.ai);

  return <>
    <div className={reportStyles.metrics}>
      <section className={reportStyles.metricGroup} aria-labelledby="visit-metrics-title">
        <h3 id="visit-metrics-title">访问规模</h3>
        <dl className={reportStyles.primaryMetrics}>
          <div><dt>访问次数 <small>PV</small></dt><dd>{value(total)}<span>次</span></dd><p>{coverageText(report.visits) || "业务页面实际显示次数"}</p></div>
          <div><dt>去重访问人数 <small>UV</small></dt><dd>{value(people)}<span>个</span></dd>
            <p>{people === null ? coverageText(report.visitors) : `员工 ${value(report.visitors.employees)} 人 · 访客 ${value(report.visitors.guests)} 个标识`}</p>
            {report.visitors.status === "partial" && <p>{coverageText(report.visitors)}</p>}</div>
        </dl>
      </section>
      <section className={`${reportStyles.metricGroup} ${reportStyles.aiGroup}`} aria-labelledby="ai-metrics-title">
        <h3 id="ai-metrics-title">AI 使用</h3>
        <dl className={reportStyles.secondaryMetrics}>
          <div><dt>AI 对话次数</dt><dd>{value(report.ai.conversations)}<span>段</span></dd><p>所选时段有用户提问的会话</p></div>
          <div><dt>AI 对话轮次</dt><dd>{value(report.ai.rounds)}<span>轮</span></dd><p>每条用户提问计为一轮</p></div>
        </dl>
        {aiNote && <p className={reportStyles.sourceNote}>{aiNote}</p>}
      </section>
    </div>
    <div className={reportStyles.panels}>
      <section className={reportStyles.panel} aria-labelledby="module-visits-title">
        <div className={reportStyles.panelHeading}><h3 id="module-visits-title">常用模块访问次数</h3><span>次数 / 占比</span></div>
        <p className={reportStyles.panelDescription}>按访问次数排序，占比以所选时段已记录 PV 为分母。</p>
        {modules.length > 0 ? <ol className={reportStyles.moduleList}>{modules.map((item, index) => {
          const share = total !== null && total > 0 && item.views <= total ? item.views / total * 100 : null;
          const shareLabel = share === null ? "—" : share > 0 && share < .1 ? "<0.1%" : `${percentFormat.format(share)}%`;
          return <li key={item.module}>
            <div className={reportStyles.moduleReadout}>
              <span className={reportStyles.rank}>{index + 1}</span><span className={reportStyles.moduleName}>{item.label}</span>
              <strong>{numberFormat.format(item.views)} <small>次</small></strong>
              <span className={reportStyles.share} aria-label={share === null ? "占比暂不可用" : `占已记录访问 ${shareLabel}`}>{shareLabel}</span>
            </div>
            <div className={reportStyles.moduleTrack} aria-hidden="true"><span style={{ width: `${share ?? 0}%` }} /></div>
          </li>;
        })}</ol> : <p className={styles.empty}>{total === 0 && moduleSourceAvailable ? "所选时段暂无模块访问。" : sourceNote(report.visits.status, report.visits.note)}</p>}
        {report.visits.status === "partial" && modules.length > 0 && <p className={reportStyles.sourceNote}>模块占比仅反映已记录范围。</p>}
      </section>
      <section className={reportStyles.panel} aria-labelledby="department-visits-title">
        <div className={reportStyles.panelHeading}><h3 id="department-visits-title">访问最多的 Top 10 部门</h3><span>访问次数</span></div>
        <p className={reportStyles.panelDescription}>条长按最高部门对比，只展示符合统计条件的部门。</p>
        {departments.length > 0 ? <ol className={reportStyles.departmentList}>{departments.map((item, index) => <li key={item.department}>
          <span className={reportStyles.rank}>{index + 1}</span>
          <span className={reportStyles.departmentLabel}>{item.department}</span>
          <strong>{numberFormat.format(item.views)}<small> 次</small></strong>
          <div className={reportStyles.departmentTrack} aria-hidden="true"><span style={{ width: `${departmentMaximum ? item.views / departmentMaximum * 100 : 0}%` }} /></div>
        </li>)}</ol> : <p className={styles.empty}>{sourceNote(report.departments.status, report.departments.note) || "所选时段暂无符合统计条件的部门。"}</p>}
        {report.departments.unknownOrganizationVisits !== null && report.departments.unknownOrganizationVisits > 0 && <p className={reportStyles.sourceNote}>另有 {numberFormat.format(report.departments.unknownOrganizationVisits)} 次员工访问未提供部门。</p>}
        {report.departments.note && departments.length > 0 && <p className={reportStyles.sourceNote}>{coverageText(report.departments)}</p>}
      </section>
    </div>
    <details className={styles.metricDefinitions}>
      <summary>统计口径与数据范围</summary>
      <p>访问统计自本环境启用采集、使用者确认首次告知后计入，依赖可见页面导航上报；未上报的访问无法观测。</p>
      <p>访问次数按已显示的业务页面计数。员工按账号去重，匿名访客按短期标识分别去重，同一人更换身份或访客标识后可能重复计数。模块次数与访问日历采用同一来源。</p>
      <p>AI 对话按已保存的用户消息统计，历史补传时间可能晚于实际提问。部门采用访问时身份源提供的组织信息，只展示达到样本门槛的部门。</p>
    </details>
  </>;
}

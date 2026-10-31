import type { UsageReport, ReportStatus } from "@/modules/analytics/report";
import styles from "../platform-admin.module.css";

const numberFormat = new Intl.NumberFormat("zh-CN");

function value(value: number | null) {
  return value === null ? "—" : numberFormat.format(value);
}
function coverageText(source: { status: ReportStatus; observedFrom: string | null; note: string }) {
  if (source.status === "partial" && source.observedFrom) {
    const start = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(source.observedFrom));
    return `已记录范围自 ${start} 起（北京时间）`;
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
  const maximum = Math.max(1, ...report.visits.modules.map(item => item.views));
  return <>
    <dl className={styles.headlineMetrics}>
      <div><dt>访问次数 <small>PV</small></dt><dd>{value(report.visits.total)}<span>次</span></dd><p>{coverageText(report.visits) || "业务页面实际显示次数"}</p></div>
      <div><dt>去重访问人数 <small>UV</small></dt><dd>{value(people)}<span>个</span></dd>
        <p>{report.visitors.employees === null ? coverageText(report.visitors) : `员工 ${value(report.visitors.employees)} 人 · 访客 ${value(report.visitors.guests)} 个标识`}</p>
        {report.visitors.status === "partial" && <p>{coverageText(report.visitors)}</p>}</div>
      <div><dt>AI 对话次数</dt><dd>{value(report.ai.conversations)}<span>段</span></dd><p>所选时段有用户提问的会话</p></div>
      <div><dt>AI 对话轮次</dt><dd>{value(report.ai.rounds)}<span>轮</span></dd><p>每条用户提问计为一轮</p></div>
    </dl>
    {report.ai.note && <p className={styles.reportNote}>{report.ai.note}</p>}
    <div className={styles.reportColumns}>
      <section className={styles.reportPanel} aria-labelledby="module-visits-title">
        <div className={styles.sectionHeader}><h3 id="module-visits-title">常用模块访问次数</h3><span className={styles.caption}>按访问次数排序</span></div>
        {report.visits.modules.length > 0 ? <ol className={styles.moduleList}>{report.visits.modules.map(item => <li key={item.module}>
          <div><span>{item.label}</span><strong>{numberFormat.format(item.views)} <small>次</small></strong></div>
          <div className={styles.barTrack} aria-hidden="true"><span style={{ width: `${item.views / maximum * 100}%` }} /></div>
        </li>)}</ol> : <p className={styles.empty}>{report.visits.total === 0 ? "所选时段暂无模块访问。" : sourceNote(report.visits.status, report.visits.note)}</p>}
      </section>
      <section className={styles.reportPanel} aria-labelledby="department-visits-title">
        <div className={styles.sectionHeader}><h3 id="department-visits-title">访问最多的 Top 10 部门</h3><span className={styles.caption}>访问次数</span></div>
        {report.departments.items.length > 0 ? <ol className={styles.rankingList}>{report.departments.items.map((item, index) => <li key={item.department}>
          <span className={styles.rankNumber}>{index + 1}</span><span className={styles.departmentName}>{item.department}</span><strong>{numberFormat.format(item.views)}<small> 次</small></strong>
        </li>)}</ol> : <p className={styles.empty}>{sourceNote(report.departments.status, report.departments.note) || "所选时段暂无符合统计条件的部门。"}</p>}
        {report.departments.unknownOrganizationVisits !== null && report.departments.unknownOrganizationVisits > 0 && <p className={styles.note}>另有 {numberFormat.format(report.departments.unknownOrganizationVisits)} 次员工访问未提供部门。</p>}
        {report.departments.note && report.departments.items.length > 0 && <p className={styles.note}>{coverageText(report.departments)}</p>}
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

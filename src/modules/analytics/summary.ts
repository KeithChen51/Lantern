import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";

/** Aggregate-only read model. Authorization belongs to each server entry point. */
export type AnalyticsPeriod = 7 | 30;
export type AnalyticsMetric = { key: string; label: string; value: number | null; unit: string };
export type AnalyticsSection = {
  id: string;
  title: string;
  status: "available" | "unavailable" | "not_collected";
  source: string;
  description: string;
  metrics: AnalyticsMetric[];
  note: string;
};
export type AnalyticsSummary = {
  period: { days: AnalyticsPeriod; startDate: string; endDate: string; timeZone: "Asia/Shanghai"; generatedAt: string };
  sections: AnalyticsSection[];
};

type Counts = Record<string, number | bigint | null | undefined>;
export type SummarySource = "auth" | "hermit" | "knowledgeInventory" | "knowledgeOperations";
export type SummaryReader = (source: SummarySource, start: Date, end: Date) => Promise<Counts>;
type SummaryOptions = {
  now?: Date;
  read?: SummaryReader;
  knowledgeDriver?: string;
  knowledgeEnabled?: boolean;
};
const DAY = 86_400_000;
const SHANGHAI_OFFSET = 8 * 3_600_000;

export function analyticsWindow(days: AnalyticsPeriod, now: Date) {
  if (days !== 7 && days !== 30) throw new RangeError("Only 7-day and 30-day analytics windows are supported");
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid analytics generation time");
  const today = Math.floor((now.getTime() + SHANGHAI_OFFSET) / DAY) * DAY - SHANGHAI_OFFSET;
  const start = new Date(today - (days - 1) * DAY);
  const localDate = (date: Date) => new Date(date.getTime() + SHANGHAI_OFFSET).toISOString().slice(0, 10);
  return { start, end: new Date(now), startDate: localDate(start), endDate: localDate(now) };
}

/** All filtering and counting occurs in MySQL; no messages, identities or audit payloads leave it. */
const readDatabase: SummaryReader = async (source, start, end) => {
  let rows: Counts[];
  if (source === "auth") {
    rows = await prisma.$queryRaw<Counts[]>(Prisma.sql`
      SELECT
        CAST(COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.action')) = 'login'), 0) AS UNSIGNED) AS logins,
        CAST(COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.action')) IN ('logout', 'logout-all')), 0) AS UNSIGNED) AS logouts
      FROM access_records
      WHERE kind = 'audit' AND createdAt >= ${start} AND createdAt <= ${end}
    `);
  } else if (source === "hermit") {
    rows = await prisma.$queryRaw<Counts[]>(Prisma.sql`
      SELECT
        CAST(COALESCE(SUM(s.user_id IS NOT NULL AND s.guest_id IS NULL), 0) AS UNSIGNED) AS employeeMessages,
        CAST(COALESCE(SUM(s.guest_id IS NOT NULL AND s.user_id IS NULL), 0) AS UNSIGNED) AS guestMessages,
        CAST(COALESCE(SUM((s.user_id IS NULL AND s.guest_id IS NULL) OR (s.user_id IS NOT NULL AND s.guest_id IS NOT NULL)), 0) AS UNSIGNED) AS unknownMessages,
        COUNT(DISTINCT m.session_id) AS conversations,
        COUNT(DISTINCT CASE WHEN s.user_id IS NOT NULL AND s.guest_id IS NULL THEN s.user_id END) AS employees
      FROM chat_messages AS m INNER JOIN chat_sessions AS s ON s.id = m.session_id
      WHERE m.role = 'user' AND m.created_at >= ${start} AND m.created_at <= ${end}
    `);
  } else if (source === "knowledgeInventory") {
    // These are current-state counts, independent of the selected event window.
    rows = await prisma.$queryRaw<Counts[]>(Prisma.sql`
      SELECT COUNT(*) AS resources,
        CAST(COALESCE(SUM(publishedVersionId IS NOT NULL), 0) AS UNSIGNED) AS publishedResources,
        CAST(COALESCE(SUM(publishedVersionId IS NULL), 0) AS UNSIGNED) AS unpublishedResources
      FROM hub_resources WHERE archived = false
    `);
  } else {
    rows = await prisma.$queryRaw<Counts[]>(Prisma.sql`
      SELECT COUNT(*) AS operations FROM hub_audits
      WHERE createdAt >= ${start} AND createdAt <= ${end}
    `);
  }
  if (rows.length !== 1) throw new Error("Invalid analytics aggregate");
  return rows[0];
};

function metric(key: string, label: string, unit = "次"): AnalyticsMetric {
  return { key, label, value: null, unit };
}
function checkedCount(value: number | bigint | null | undefined): number {
  if (typeof value !== "number" && typeof value !== "bigint") throw new Error("Missing analytics aggregate");
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid analytics count");
  return count;
}

export async function getAnalyticsSummary(days: AnalyticsPeriod = 7, options: SummaryOptions = {}): Promise<AnalyticsSummary> {
  const now = options.now ?? new Date();
  const window = analyticsWindow(days, now);
  const read = options.read ?? readDatabase;
  const definitions: Array<AnalyticsSection & { id: SummarySource }> = [
    {
      id: "auth", title: "登录与退出", status: "unavailable", source: "员工认证审计",
      description: "所选日期内保存的员工成功登录与主动退出次数。",
      metrics: [metric("logins", "成功登录"), metric("logouts", "主动退出")],
      note: "登录次数不等于使用人数。尚未接入登录失败、访问拒绝和入口渠道；历史记录可能已按原有期限清理。",
    },
    {
      id: "hermit", title: "路引已保存的提问", status: "unavailable", source: "路引已保存的会话和消息",
      description: "按用户消息首次保存时间统计，含今日截至页面生成时刻。",
      metrics: [metric("employeeMessages", "员工用户消息"), metric("guestMessages", "访客用户消息"), metric("unknownMessages", "身份未知用户消息"), metric("conversations", "有用户消息的会话", "段"), metric("employees", "提问员工人数", "人")],
      note: "仅覆盖已成功保存的数据；旧客户端历史回传可能使保存时间晚于实际提问。访客与员工分别统计，身份已脱离的历史记录列为未知。尚无完整尝试、失败、取消、耗时和解决效果数据。",
    },
    {
      id: "knowledgeInventory", title: "当前知识供给", status: "unavailable", source: "知识资料库",
      description: "当前未归档资料快照，不受上方日期筛选影响。",
      metrics: [metric("resources", "未归档资料", "份"), metric("publishedResources", "已有发布版本", "份"), metric("unpublishedResources", "尚无发布版本", "份")],
      note: "有发布版本不代表仍在有效期，也不代表可向所有身份展示。适用岗位、维护人、复核日期及错误反馈的统一来源尚未提供。",
    },
    {
      id: "knowledgeOperations", title: "知识维护记录", status: "unavailable", source: "知识维护审计",
      description: "所选日期内保存的知识维护审计条数。",
      metrics: [metric("operations", "维护审计记录")],
      note: "一项业务操作可能对应多条审计；记录数不等于操作人数，也不表示普通阅读或敏感查询已被跟踪。",
    },
  ];
  const knowledgeReady = (options.knowledgeDriver ?? process.env.KNOWLEDGE_HUB_DRIVER ?? "mysql") === "mysql" && (options.knowledgeEnabled ?? process.env.KNOWLEDGE_HUB_ENABLED === "true");
  const sections = await Promise.all(definitions.map(async (definition): Promise<AnalyticsSection> => {
    if (definition.id.startsWith("knowledge") && !knowledgeReady) {
      return { ...definition, status: "not_collected", note: "当前知识管理尚未启用或该知识来源尚未接入汇总。" };
    }
    try {
      const counts = await read(definition.id, window.start, window.end);
      const metrics = definition.metrics.map((item) => ({ ...item, value: checkedCount(counts[item.key]) }));
      return { ...definition, status: "available", metrics };
    } catch {
      // Never expose DB errors, connection strings, query data or stack traces.
      return { ...definition, note: "本次读取未成功，数据暂不可用。请检查数据源连接及结构后重试。" };
    }
  }));
  sections.push({
    id: "coverage", title: "待接入的监测", status: "not_collected", source: "尚无统一行为事件来源",
    description: "以下指标将在后续采集与留存能力交付后提供。",
    metrics: [metric("pageViews", "页面访问"), metric("activeVisitors", "平台业务活跃人数", "人"), metric("searches", "搜索"), metric("contentReads", "资料阅读"), metric("generationAttempts", "路引生成尝试")],
    note: "跨模块路径、复访、活跃时长、阅读与搜索链路、完整路引运行质量、敏感查询审计和统一数据健康待接入；未采集不显示为零。现有页面不提供个人明细、聊天正文或导出。",
  });
  return {
    period: { days, startDate: window.startDate, endDate: window.endDate, timeZone: "Asia/Shanghai", generatedAt: now.toISOString() },
    sections,
  };
}

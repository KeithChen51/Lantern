import Link from "next/link";
import { LhButton, LhEmptyState } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { Icon } from "@iconify/react";
import { PageHeading } from "@/components/ui/PageHeading";
import { getPublicActionCaseSummaries } from "./public-action-cases";
import styles from "../mirror/content-v3.module.css";
import filterStyles from "./action-filter.module.css";
import { actionCaseTags, filterActionCases } from "./case-filters";
import { ReadingEntryLink, ReadingListPosition } from "@/components/knowledge/ReadingListNavigation";
import { readingEntryId, readingListPath } from "@/components/knowledge/reading-return";

const trainingSteps = [
  "先读清楚客户问题和触发条件。",
  "再拆出客户、门店、政策、指标四类视角。",
  "最后判断最终做法是否守住客户价值。",
];

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  if (status === "published") return "已发布";
  if (status === "archived") return "已归档";
  return "草稿";
}

export default async function ActionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [actionCases, params] = await Promise.all([getPublicActionCaseSummaries(), searchParams]);
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const tag = typeof params.tag === "string" ? params.tag.slice(0, 100) : "";
  const tags = actionCaseTags(actionCases);
  const filteredCases = filterActionCases(actionCases, query, tag);
  const returnTo = readingListPath("/action", params);

  return (
    <div data-lh-action-page data-lh-page-archetype="case-workflow" data-lh-page="action" className={styles.page}>
      <ReadingListPosition returnTo={returnTo} />
      <div className={styles.stack}>
        <PageHeading title="笃行" description="回到真实服务现场，看见选择、权衡与行动。" />

        <div className={styles.toolbar}>
          <p className={styles.toolbarMeta} role="status">内部实践&nbsp; / &nbsp;{query || tag ? `${filteredCases.length} / ${actionCases.length}` : actionCases.length} 篇案例</p>
          <details className={styles.methodInline}>
            <summary className={styles.toolbarAction}>复盘方法</summary>
            <div className={styles.methodBody}>
              <p>笃行案例回到真实政策、门店和客户现场，先判断条件，再讨论行动。</p>
              <ol className={styles.methodList}>
                {trainingSteps.map((step, index) => (
                  <li key={step}>
                    <span className={styles.methodIndex}>{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        </div>

        {actionCases.length > 0 && <form action="/action" className={filterStyles.filters} aria-label="查找案例">
          <label>关键词<input name="q" defaultValue={query} maxLength={200} placeholder="搜索案例、客户问题或服务场景…" /></label>
          <label>案例标签<select name="tag" defaultValue={tag} aria-label="案例标签"><option value="">全部标签</option>{tag && !tags.some(([value]) => value === tag) && <option value={tag}>{tag}（暂无案例）</option>}{tags.map(([value, count]) => <option key={value} value={value}>{value} · {count}</option>)}</select></label>
          <div className={filterStyles.actions}><LhButton type="submit" variant="primary">查找案例</LhButton>{Boolean(query || tag) && <Link href="/action">清空筛选</Link>}</div>
        </form>}

        {actionCases.length === 0 ? (
          <LhEmptyState
            tone="neutral"
            icon={<Icon icon={lighthouseIcons.document} className="h-5 w-5" />}
            title="更多内部实践待沉淀"
            description="后续可继续接入真实服务案例，让一线经验留在组织里。"
          />
        ) : filteredCases.length === 0 ? <LhEmptyState tone="neutral" title="没有匹配的案例" description="试试其他关键词，或清空筛选查看全部案例。" /> : (
          <div className={styles.actionGrid}>
            {filteredCases.map((actionCase) => (
              <ReadingEntryLink
                key={actionCase.slug}
                href={actionCase.href}
                returnTo={returnTo}
                entryId={readingEntryId(actionCase.slug)}
                data-lh-action-card
                data-lh-action-question={actionCase.question}
                data-lh-action-keynodes={actionCase.highlights.join(" · ")}
                className={styles.actionCard}
              >
                <p className={styles.actionMeta}>
                  内部实践 / {actionCase.tags[0] ?? "服务现场"} · {actionCase.date} · {statusLabel(actionCase.status)}
                </p>
                <h2 className={styles.actionTitle}>{actionCase.title}</h2>
                <p className={styles.actionSummary}>{actionCase.summary}</p>
                <p className={styles.actionLink}>阅读案例 →</p>
              </ReadingEntryLink>
            ))}
          </div>
        )}

        <details className={styles.methodDisclosure}>
          <summary>查看笃行案例字段</summary>
          <div className={styles.methodBody}>
            <p>每个案例保留问题与触发、关键选择、客户影响、门店能力、风险控制和来源材料，方便后续进入路引问答。</p>
          </div>
        </details>
      </div>
    </div>
  );
}

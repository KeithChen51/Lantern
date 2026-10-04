import Link from "next/link";
import { LhEmptyState } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { Icon } from "@iconify/react";
import { PageHeading } from "@/components/ui/PageHeading";
import { getPublicActionCaseSummaries } from "./public-action-cases";
import styles from "../mirror/content-v3.module.css";

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

export default async function ActionPage() {
  const actionCases = await getPublicActionCaseSummaries();

  return (
    <div data-lh-action-page data-lh-page-archetype="case-workflow" data-lh-page="action" className={styles.page}>
      <div className={styles.stack}>
        <PageHeading title="笃行" description="回到真实服务现场，看见选择、权衡与行动。" />

        <div className={styles.toolbar}>
          <p className={styles.toolbarMeta}>内部实践&nbsp; / &nbsp;{actionCases.length} 篇案例</p>
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

        {actionCases.length === 0 ? (
          <LhEmptyState
            tone="neutral"
            icon={<Icon icon={lighthouseIcons.document} className="h-5 w-5" />}
            title="更多内部实践待沉淀"
            description="后续可继续接入真实服务案例，让一线经验留在组织里。"
          />
        ) : (
          <div className={styles.actionGrid}>
            {actionCases.map((actionCase) => (
              <Link
                key={actionCase.slug}
                href={actionCase.href}
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
              </Link>
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

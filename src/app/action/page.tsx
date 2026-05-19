import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  LhCard,
  LhChip,
  LhDataTableShell,
  LhPanel,
  LhSectionHeader,
  LhStatusBadge,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { ACTION_CASES } from "./action-cases";

const trainingSteps = [
  "先读清楚客户问题和触发条件",
  "再拆出客户、门店、政策、指标四类视角",
  "最后判断最终做法是否守住客户价值",
];

export default function ActionPage() {
  return (
    <div className="space-y-10 pb-16">
      <LhPanel elevated className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_320px] md:p-8">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <LhChip tone="primary">
              <Icon icon={lighthouseIcons.action} className="h-4 w-4" />
              笃行
            </LhChip>
            <LhStatusBadge tone="warning">判断训练</LhStatusBadge>
          </div>
          <h1 className="max-w-4xl text-4xl font-extrabold leading-tight text-ink md:text-6xl">
            把真实服务实践，拆成可以复盘的判断训练。
          </h1>
          <p className="mt-6 max-w-4xl text-base leading-8 text-ink-soft md:text-lg">
            笃行记录内部已经发生的服务实践。重点不是把案例讲完，而是回到真实政策、真实门店和真实客户场景里，看客户体验是否被守住，门店是否具备执行条件，政策指标是否真的服务于客户价值。
          </p>
        </div>

        <aside className="rounded-md border border-line bg-surface-quiet p-5">
          <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">训练流程</p>
          <ol className="mt-4 grid gap-3">
            {trainingSteps.map((step, index) => (
              <li key={step} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 text-sm leading-6 text-ink-soft">
                <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-panel text-xs font-extrabold text-primary-deep">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </aside>
      </LhPanel>

      <section className="space-y-6">
        <LhSectionHeader
          eyebrow="内部实践"
          title="内部实践案例"
          description="案例卡片固定呈现场景、问题、决策节点和进入动作。后续新增案例也按同一结构沉淀。"
        />

        <div className="grid gap-5">
          {ACTION_CASES.map((actionCase) => (
            <Link key={actionCase.slug} href={actionCase.href} className="group block">
              <LhCard className="grid min-h-[320px] gap-6 p-6 transition-[border-color,box-shadow,transform] duration-150 group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:shadow-lh-md lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="grid min-w-0 grid-rows-[auto_1fr_auto] gap-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <LhChip tone="primary">{actionCase.metadata.date}</LhChip>
                    <LhChip tone={actionCase.metadata.status === "published" ? "success" : "warning"}>
                      {actionCase.metadata.status === "published" ? "已发布" : "草稿"}
                    </LhChip>
                    {actionCase.metadata.tags.slice(0, 3).map((tag) => (
                      <LhChip key={tag} tone="neutral">
                        {tag}
                      </LhChip>
                    ))}
                  </div>

                  <div>
                    <h2 className="max-w-4xl text-3xl font-extrabold leading-tight text-ink md:text-4xl">
                      {actionCase.metadata.title}
                    </h2>
                    <p className="mt-5 max-w-3xl text-base leading-8 text-ink-soft">{actionCase.brief.oneLine}</p>
                    <div className="mt-5 rounded-sm border border-line bg-surface-quiet p-4">
                      <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">案例问题</p>
                      <p className="mt-2 text-sm leading-7 text-ink-soft">{actionCase.brief.caseQuestion}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-line pt-4">
                    <span className="text-sm font-bold text-muted">笃行学习卡</span>
                    <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-line-strong bg-panel px-3 text-xs font-bold text-primary-deep shadow-lh-sm">
                      <Icon icon={lighthouseIcons.document} className="h-4 w-4" />
                      查看复盘
                    </span>
                  </div>
                </div>

                <aside className="rounded-md border border-line bg-surface-quiet p-5">
                  <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">关键节点</p>
                  <ol className="mt-4 grid gap-3">
                    {actionCase.decisionNodes.map((decision, index) => (
                      <li key={decision.title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 text-sm leading-6 text-ink-soft">
                        <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-panel text-xs font-extrabold text-primary-deep">
                          {index + 1}
                        </span>
                        <span>{decision.title}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-5 border-t border-line pt-4 text-xs leading-6 text-muted">
                    维护字段：背景与触发、认知冲突、关键选择、客户影响、门店能力、风险控制、来源材料。
                  </p>
                </aside>
              </LhCard>
            </Link>
          ))}

          <LhCard className="grid gap-4 border-dashed p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <LhChip tone="neutral">待补充</LhChip>
              <h2 className="mt-4 text-2xl font-extrabold text-ink">更多内部实践待沉淀</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-soft">
                后续可继续接入交付、索赔、客户关怀、门店协同等真实案例，让一线经验留在组织里。
              </p>
            </div>
            <span className="text-sm font-extrabold text-muted">等待新增案例</span>
          </LhCard>
        </div>
      </section>

      <LhDataTableShell>
        <table>
          <thead>
            <tr>
              <th>案例学习结构</th>
              <th>本页如何处理</th>
              <th>迁移目标</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>问题与触发</td>
              <td>首屏直接呈现案例问题和训练目标。</td>
              <td>先进入判断，不先进入长文叙事。</td>
            </tr>
            <tr>
              <td>决策节点</td>
              <td>卡片右侧固定预览关键节点。</td>
              <td>让读者知道这个案例要练什么。</td>
            </tr>
            <tr>
              <td>后续承接</td>
              <td>详情页连接最终做法、门店启示和可复用原则。</td>
              <td>把案例沉淀成笃行与共创可复用材料。</td>
            </tr>
          </tbody>
        </table>
      </LhDataTableShell>
    </div>
  );
}

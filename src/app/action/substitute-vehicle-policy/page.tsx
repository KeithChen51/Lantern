import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getActionCaseBySlug } from "../action-cases";

const CASE_SLUG = "substitute-vehicle-policy";

export default function SubstituteVehiclePolicyPage() {
  const actionCase = getActionCaseBySlug(CASE_SLUG);

  if (!actionCase) {
    notFound();
  }

  const { metadata, brief, background, evidence } = actionCase;

  return (
    <article className="space-y-10 pb-16">
      <div>
        <Link
          href="/action"
          className="inline-flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-2 text-sm font-bold text-primary-deep shadow-lh-sm transition-colors hover:border-line-strong hover:bg-primary-soft"
        >
          <Icon icon={lighthouseIcons.action} className="h-4 w-4" />
          返回笃行
        </Link>
      </div>

      <LhPanel elevated className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_340px] md:p-8">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <LhChip tone="primary">
              <Icon icon={lighthouseIcons.action} className="h-4 w-4" />
              {metadata.kicker}
            </LhChip>
            <LhStatusBadge tone="warning">{metadata.status === "published" ? "已发布" : "草稿"}</LhStatusBadge>
          </div>
          <h1 className="max-w-4xl text-4xl font-extrabold leading-tight text-ink md:text-6xl">{metadata.title}</h1>
          <p className="mt-6 max-w-4xl text-base leading-8 text-ink-soft md:text-lg">{brief.oneLine}</p>
        </div>

        <aside className="rounded-md border border-line bg-surface-quiet p-5">
          <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">案例信息</p>
          <dl className="mt-4 grid gap-4 text-sm">
            <MetaItem label="受众" value={metadata.audience.join("、")} />
            <MetaItem label="版本" value={metadata.version} />
            <MetaItem label="负责人" value={metadata.owner} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            {metadata.tags.map((tag) => (
              <LhChip key={tag} tone="signal">
                {tag}
              </LhChip>
            ))}
          </div>
        </aside>
      </LhPanel>

      <section className="grid gap-5 md:grid-cols-2">
        <LhCard className="p-5">
          <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">学习目标</p>
          <p className="mt-3 text-base leading-8 text-ink-soft">{brief.learningGoal}</p>
        </LhCard>
        <LhCard className="p-5">
          <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">案例问题</p>
          <p className="mt-3 text-base leading-8 text-ink-soft">{brief.caseQuestion}</p>
        </LhCard>
      </section>

      <ContentSection eyebrow="背景触发" title="背景与触发">
        <div className="grid gap-5 md:grid-cols-2">
          <LhCard className="p-5">
            <h3 className="text-lg font-extrabold text-ink">业务背景</h3>
            <p className="mt-3 text-sm leading-7 text-ink-soft">{background.context}</p>
          </LhCard>
          <LhCard className="p-5">
            <h3 className="text-lg font-extrabold text-ink">触发问题</h3>
            <p className="mt-3 text-sm leading-7 text-ink-soft">{background.trigger}</p>
          </LhCard>
        </div>
      </ContentSection>

      <ContentSection
        eyebrow="认知视角"
        title="先拆认知视角"
        description="这个案例不是门店和总部之间的简单冲突，而是不同角色对“什么才算照顾好客户”的判断差异。"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {actionCase.cognitiveFrames.map((frame) => (
            <LhCard key={frame.label} className="grid min-h-52 grid-rows-[auto_auto_1fr] gap-3 p-5">
              <h3 className="text-xl font-extrabold text-ink">{frame.label}</h3>
              <LhChip tone="primary">{frame.focus}</LhChip>
              <p className="text-sm leading-7 text-ink-soft">{frame.question}</p>
            </LhCard>
          ))}
        </div>
      </ContentSection>

      <ContentSection
        eyebrow="关键节点"
        title="关键权衡"
        description="每个节点都同时看客户体验、门店实际能力和政策执行风险。"
      >
        <div className="space-y-6">
          {actionCase.decisionNodes.map((decision, index) => (
            <LhPanel key={decision.title} className="p-5 md:p-6">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div>
                  <LhChip tone="primary">节点 {index + 1}</LhChip>
                  <h3 className="mt-3 text-2xl font-extrabold leading-tight text-ink">{decision.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">{decision.trigger}</p>
                </div>
                <LhStatusBadge tone={decision.status === "已落地" ? "success" : "warning"}>{decision.status}</LhStatusBadge>
              </div>

              <LhDataTableShell className="mt-5">
                <table>
                  <thead>
                    <tr>
                      <th>视角</th>
                      <th>影响判断</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>客户体验</td>
                      <td>{decision.impacts.customer}</td>
                    </tr>
                    <tr>
                      <td>门店能力</td>
                      <td>{decision.impacts.store}</td>
                    </tr>
                    <tr>
                      <td>财务合规</td>
                      <td>{decision.impacts.compliance}</td>
                    </tr>
                  </tbody>
                </table>
              </LhDataTableShell>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-sm border border-line bg-surface-quiet p-4">
                  <p className="text-sm font-extrabold text-primary-deep">最终选择</p>
                  <p className="mt-2 text-sm leading-7 text-ink-soft">{decision.finalChoice}</p>
                </div>
                <div className="rounded-sm border border-line bg-surface-quiet p-4">
                  <p className="text-sm font-extrabold text-primary-deep">风险控制</p>
                  <p className="mt-2 text-sm leading-7 text-ink-soft">{decision.riskControl}</p>
                </div>
              </div>

              <details className="mt-5 rounded-sm border border-line bg-panel p-4">
                <summary className="cursor-pointer text-sm font-extrabold text-primary-deep">查看当时面对的选择</summary>
                <LhDataTableShell className="mt-4">
                  <table>
                    <thead>
                      <tr>
                        <th>选择</th>
                        <th>描述</th>
                        <th>客户影响</th>
                        <th>门店影响</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decision.options.map((option) => (
                        <tr key={option.label}>
                          <td>{option.label}</td>
                          <td>{option.description}</td>
                          <td>{option.customerEffect}</td>
                          <td>{option.storeEffect}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </LhDataTableShell>
              </details>
            </LhPanel>
          ))}
        </div>
      </ContentSection>

      <ContentSection eyebrow="最终做法" title="最终做法">
        <ol className="grid gap-4 md:grid-cols-2">
          {actionCase.finalPractice.map((item, index) => (
            <li key={item} className="rounded-md border border-line bg-panel p-5 shadow-lh-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-primary-soft text-sm font-extrabold text-primary-deep">
                {index + 1}
              </span>
              <p className="mt-4 text-sm leading-7 text-ink-soft">{item}</p>
            </li>
          ))}
        </ol>
      </ContentSection>

      <ContentSection eyebrow="门店启示" title="门店启示">
        <div className="grid gap-4 md:grid-cols-2">
          {actionCase.storeTakeaways.map((takeaway) => (
            <LhCard key={takeaway.title} className="p-5">
              <h3 className="text-lg font-extrabold text-ink">{takeaway.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-soft">{takeaway.body}</p>
            </LhCard>
          ))}
        </div>
      </ContentSection>

      <ContentSection eyebrow="可复用原则" title="可复用原则">
        <div className="grid gap-3">
          {actionCase.reusablePrinciples.map((principle) => (
            <div key={principle} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-md border border-line bg-surface-quiet p-4 text-sm leading-7 text-ink-soft">
              <Icon icon={lighthouseIcons.status} className="mt-1 h-5 w-5 text-success" />
              <p>{principle}</p>
            </div>
          ))}
        </div>
      </ContentSection>

      <ContentSection
        eyebrow="来源材料"
        title="来源材料"
        description="原始正文和访谈材料保留为维护信息，前台只呈现结构化案例。"
      >
        <details className="rounded-md border border-dashed border-line-strong bg-surface-quiet p-5">
          <summary className="cursor-pointer text-sm font-extrabold text-primary-deep">查看维护字段</summary>
          <div className="mt-5 space-y-5">
            {evidence.sourceMaterials.map((source) => (
              <div key={source.title} className="border-t border-line pt-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-extrabold text-ink">{source.title}</p>
                  <LhChip tone="neutral">{source.type}</LhChip>
                  <LhChip tone="warning">{source.visibility}</LhChip>
                </div>
                <p className="mt-2 text-sm leading-7 text-ink-soft">{source.note}</p>
              </div>
            ))}
            <div className="space-y-2 border-t border-line pt-4">
              {evidence.sourceNotes.map((note) => (
                <p key={note} className="text-xs leading-6 text-muted">
                  {note}
                </p>
              ))}
            </div>
          </div>
        </details>
      </ContentSection>

      <LhPanel className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="text-xs font-extrabold tracking-[0.14em] text-primary-deep">后续用途</p>
          <p className="mt-2 text-sm leading-7 text-ink-soft">
            这个案例后续可以拆成共创里的岗位应做/避免，也可以作为路引回答代用车、等待焦虑、政策弹性问题时的引用材料。
          </p>
        </div>
        <LhChip tone="signal">转入共创与路引</LhChip>
      </LhPanel>
    </article>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-1 leading-6 text-ink-soft">{value}</dd>
    </div>
  );
}

function ContentSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <LhSectionHeader eyebrow={eyebrow} title={title} description={description} />
      {children}
    </section>
  );
}

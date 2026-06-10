import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import ReactMarkdown from "react-markdown";
import {
  LhCard,
  LhChip,
  LhDataTableShell,
  LhPageHero,
  LhPanel,
  LhSectionHeader,
  LhStatusBadge,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import type { PublicActionCaseDetail } from "./public-action-cases";

type ActionCaseDetailViewProps = {
  actionCase: PublicActionCaseDetail;
};

export function ActionCaseDetailView({ actionCase }: ActionCaseDetailViewProps) {
  if (actionCase.source === "managed") {
    return <ManagedActionCaseDetail actionCase={actionCase.record} />;
  }

  return <StaticActionCaseDetail actionCase={actionCase.record} />;
}

function BackLink() {
  return (
    <Link
      href="/action"
      className="inline-flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-2 text-sm font-bold text-primary-deep shadow-lh-sm transition-colors hover:border-line-strong hover:bg-primary-soft"
    >
      <Icon icon={lighthouseIcons.action} className="h-4 w-4" />
      返回笃行
    </Link>
  );
}

function statusLabel(status: string) {
  if (status === "published") return "已发布";
  if (status === "archived") return "已归档";
  return "草稿";
}

function statusTone(status: string) {
  if (status === "published") return "success" as const;
  if (status === "archived") return "neutral" as const;
  return "warning" as const;
}

function CoverImage({ url, title }: { url: string | null | undefined; title: string }) {
  if (!url) return null;

  return (
    <div
      aria-label={`${title} 封面图`}
      className="min-h-72 rounded-sm border border-line bg-cover bg-center shadow-lh-sm md:min-h-[420px]"
      style={{ backgroundImage: `url("${url}")` }}
    />
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <LhChip key={tag} tone="neutral">
          {tag}
        </LhChip>
      ))}
    </div>
  );
}

function ManagedActionCaseDetail({
  actionCase,
}: {
  actionCase: Extract<PublicActionCaseDetail, { source: "managed" }>["record"];
}) {
  return (
    <article className="space-y-8 pb-12">
      <BackLink />

      <LhPageHero
        icon={<Icon icon={lighthouseIcons.action} className="h-4 w-4" />}
        eyebrow="后台发布案例"
        meta={<LhStatusBadge tone={statusTone(actionCase.status)}>{statusLabel(actionCase.status)}</LhStatusBadge>}
        title={actionCase.title}
        description={<p>{actionCase.summary}</p>}
        asideTitle="案例信息"
        asideItems={[
          { title: "日期", description: actionCase.date },
          { title: "当前版本", description: actionCase.currentVersionNo ? `v${actionCase.currentVersionNo}` : "未生成" },
          { title: "发布版本", description: actionCase.publishedVersionNo ? `v${actionCase.publishedVersionNo}` : "未发布" },
        ]}
        footer={<Tags tags={actionCase.tags} />}
      />

      <CoverImage url={actionCase.coverImage?.url} title={actionCase.title} />

      {actionCase.headings.length > 0 && (
        <ContentSection eyebrow="结构预览" title="案例标题结构">
          <ol className="grid gap-3 md:grid-cols-2">
            {actionCase.headings.slice(0, 8).map((heading, index) => (
              <li key={`${heading.level}-${heading.title}`} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-sm border border-line bg-panel p-4 text-sm leading-7 text-ink-soft">
                <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-surface-quiet text-xs font-extrabold text-primary-deep">
                  {index + 1}
                </span>
                <span>{heading.title}</span>
              </li>
            ))}
          </ol>
        </ContentSection>
      )}

      <ContentSection eyebrow="案例正文" title="Markdown 正文">
        <LhPanel className="p-5 md:p-6">
          <div className="action-case-prose text-sm leading-8 text-ink-soft md:text-base md:leading-8">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h2 className="mb-4 mt-2 text-3xl font-extrabold leading-tight text-ink">{children}</h2>,
                h2: ({ children }) => <h3 className="mb-3 mt-8 text-2xl font-extrabold leading-tight text-ink">{children}</h3>,
                h3: ({ children }) => <h4 className="mb-2 mt-6 text-xl font-extrabold leading-tight text-ink">{children}</h4>,
                p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-extrabold text-ink">{children}</strong>,
                ul: ({ children }) => <ul className="mb-5 list-disc space-y-2 pl-5 last:mb-0">{children}</ul>,
                ol: ({ children }) => <ol className="mb-5 list-decimal space-y-2 pl-5 last:mb-0">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                blockquote: ({ children }) => (
                  <blockquote className="my-5 rounded-sm border-l-4 border-primary bg-surface-quiet px-4 py-3 text-muted">
                    {children}
                  </blockquote>
                ),
                hr: () => <hr className="my-6 border-line" />,
              }}
            >
              {actionCase.markdown}
            </ReactMarkdown>
          </div>
        </LhPanel>
      </ContentSection>
    </article>
  );
}

function StaticActionCaseDetail({
  actionCase,
}: {
  actionCase: Extract<PublicActionCaseDetail, { source: "static" }>["record"];
}) {
  const { metadata, brief, background, caseBody, evidence } = actionCase;

  return (
    <article className="space-y-8 pb-12">
      <BackLink />

      <LhPageHero
        icon={<Icon icon={lighthouseIcons.action} className="h-4 w-4" />}
        eyebrow={metadata.kicker}
        meta={<LhStatusBadge tone={statusTone(metadata.status)}>{statusLabel(metadata.status)}</LhStatusBadge>}
        title={metadata.title}
        description={<p>{brief.oneLine}</p>}
        asideTitle="案例信息"
        asideItems={[
          { title: "受众", description: metadata.audience.join("、") },
          { title: "版本", description: metadata.version },
          { title: "负责人", description: metadata.owner },
        ]}
        footer={<Tags tags={metadata.tags} />}
      />

      <CoverImage url={metadata.imageUrl} title={metadata.title} />

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

      <ContentSection eyebrow="案例正文" title="从现场选择回到服务链条" description={brief.caseQuestion}>
        <LhPanel className="space-y-5 p-5 md:p-6">
          {caseBody.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-8 text-ink-soft">
              {paragraph}
            </p>
          ))}
        </LhPanel>
      </ContentSection>

      <ContentSection eyebrow="关键节点" title="关键权衡">
        <div className="space-y-5">
          {actionCase.decisionNodes.map((decision, index) => (
            <LhPanel key={decision.title} className="p-5 md:p-6">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div>
                  <LhChip tone="primary">节点 {index + 1}</LhChip>
                  <h3 className="mt-3 text-2xl font-extrabold leading-tight text-ink">{decision.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">{decision.trigger}</p>
                </div>
                <LhStatusBadge tone="neutral">{decision.status}</LhStatusBadge>
              </div>

              <LhDataTableShell className="mt-5">
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

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-sm border border-line bg-surface-quiet p-4">
                  <p className="text-sm font-extrabold text-primary-deep">最终选择</p>
                  <p className="mt-2 text-sm leading-7 text-ink-soft">{decision.finalChoice}</p>
                </div>
                <div className="rounded-sm border border-line bg-surface-quiet p-4">
                  <p className="text-sm font-extrabold text-primary-deep">风险控制</p>
                  <p className="mt-2 text-sm leading-7 text-ink-soft">{decision.riskControl}</p>
                </div>
              </div>
            </LhPanel>
          ))}
        </div>
      </ContentSection>

      <ContentSection eyebrow="最终做法" title="最终做法">
        <ol className="grid gap-4 md:grid-cols-2">
          {actionCase.finalPractice.map((item, index) => (
            <li key={item} className="rounded-sm border border-line bg-panel p-5 shadow-lh-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-surface-quiet text-sm font-extrabold text-primary-deep">
                {index + 1}
              </span>
              <p className="mt-4 text-sm leading-7 text-ink-soft">{item}</p>
            </li>
          ))}
        </ol>
      </ContentSection>

      <ContentSection eyebrow="来源材料" title="来源材料">
        <details className="rounded-sm border border-dashed border-line-strong bg-surface-quiet p-5">
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
          </div>
        </details>
      </ContentSection>
    </article>
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

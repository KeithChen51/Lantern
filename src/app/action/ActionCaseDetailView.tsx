import type { ReactNode } from "react";
import { Icon } from "@iconify/react";
import ReactMarkdown from "react-markdown";
import {
  LhBackLink,
  LhCard,
  LhChip,
  LhContentProse,
  LhDataTableShell,
  LhPanel,
  LhSectionHeader,
  LhStatusBadge,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { PageHeading } from "@/components/ui/PageHeading";
import type { PublicActionCaseDetail } from "./public-action-cases";
import { isMarkdownActionCase } from "./action-cases";
import styles from "../mirror/content-v3.module.css";

type ActionCaseDetailViewProps = {
  actionCase: PublicActionCaseDetail;
};

export function ActionCaseDetailView({ actionCase }: ActionCaseDetailViewProps) {
  if (actionCase.source === "managed") {
    return <ManagedActionCaseDetail actionCase={actionCase.record} />;
  }

  return <StaticActionCaseDetail actionCase={actionCase.record} />;
}

function statusLabel(status: string) {
  if (status === "published") return "已发布";
  if (status === "archived") return "已归档";
  return "草稿";
}

function ActionDetailHeader({
  title,
  summary,
  date,
  status,
  tags,
  keyPoint,
  keyMeta,
}: {
  title: string;
  summary: string;
  date?: string;
  status: string;
  tags?: string[];
  keyPoint: string;
  keyMeta: string;
}) {
  return (
    <>
      <LhBackLink href="/action" icon={<Icon icon={lighthouseIcons.action} className="h-4 w-4" />}>
        返回笃行
      </LhBackLink>
      <PageHeading title="案例复盘" />
      <section className={styles.detailCard}>
        <div className={styles.detailCardBody}>
          <div className={styles.detailMeta}>
            {date && <span>{date}</span>}
            <span>{statusLabel(status)}</span>
            {tags?.[0] && <span>{tags[0]}</span>}
          </div>
          <h2 className={styles.detailHeadline}>{title}</h2>
          <p className={styles.detailSummary}>{summary}</p>
        </div>
        <aside className={styles.keyPanel}>
          <p className={styles.keyPanelLabel}>关键节点</p>
          <p className={styles.keyPanelText}>{keyPoint}</p>
          <p className={styles.keyPanelMeta}>{keyMeta}</p>
        </aside>
      </section>
      <section className={styles.readingSection}>
        <h2 className={styles.sectionHeading}>先看清现场，再讨论行动</h2>
        <p>客户救援需要组织支持，让一线员工的安全、资源与付出得到保障。</p>
        <p>讨论提示：现场有哪些限制？客户、员工与门店分别承担什么？哪些做法需要组织提供支持？</p>
      </section>
    </>
  );
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

function ManagedActionCaseDetail({
  actionCase,
}: {
  actionCase: Extract<PublicActionCaseDetail, { source: "managed" }>["record"];
}) {
  return (
    <article data-lh-page="action-read" data-lh-page-archetype="case-workflow" className={`${styles.page} ${styles.detailPage} ${styles.stack}`}>
      <ActionDetailHeader
        title={actionCase.title}
        summary={actionCase.summary}
        date={actionCase.date}
        status={actionCase.status}
        tags={actionCase.tags}
        keyPoint={actionCase.headings[0]?.title ?? actionCase.title}
        keyMeta={`当前版本 ${actionCase.currentVersionNo ? `v${actionCase.currentVersionNo}` : "未生成"} · 发布版本 ${actionCase.publishedVersionNo ? `v${actionCase.publishedVersionNo}` : "未发布"}`}
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
          <LhContentProse>
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h2>{children}</h2>,
                h2: ({ children }) => <h3>{children}</h3>,
                h3: ({ children }) => <h4>{children}</h4>,
                p: ({ children }) => <p>{children}</p>,
                strong: ({ children }) => <strong>{children}</strong>,
                ul: ({ children }) => <ul>{children}</ul>,
                ol: ({ children }) => <ol>{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                blockquote: ({ children }) => <blockquote>{children}</blockquote>,
                hr: () => <hr />,
              }}
            >
              {actionCase.markdown}
            </ReactMarkdown>
          </LhContentProse>
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
  if (isMarkdownActionCase(actionCase)) {
    return <StaticMarkdownActionCaseDetail actionCase={actionCase} />;
  }

  const { metadata, brief, background, caseBody, evidence } = actionCase;

  return (
    <article data-lh-page="action-read" data-lh-page-archetype="case-workflow" className={`${styles.page} ${styles.detailPage} ${styles.stack}`}>
      <ActionDetailHeader
        title={metadata.title}
        summary={brief.oneLine}
        date={metadata.date}
        status={metadata.status}
        tags={metadata.tags}
        keyPoint={brief.caseQuestion}
        keyMeta={`${metadata.kicker} · ${metadata.owner}`}
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
          <LhContentProse>
            {caseBody.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </LhContentProse>
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
              <LhContentProse variant="compact" className="mt-4">
                <p>{item}</p>
              </LhContentProse>
            </li>
          ))}
        </ol>
      </ContentSection>

      <ContentSection eyebrow="来源材料" title="来源材料">
        <details className="rounded-sm border border-dashed border-line-strong bg-surface-quiet p-5">
          <summary className="cursor-pointer text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-primary-text">查看维护字段</summary>
          <div className="mt-5 space-y-5">
            {evidence.sourceMaterials.map((source) => (
              <div key={source.title} className="border-t border-line pt-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-ink">{source.title}</p>
                  <LhChip tone="neutral">{source.type}</LhChip>
                  <LhChip tone="warning">{source.visibility}</LhChip>
                </div>
                <LhContentProse variant="compact" className="mt-2">
                  <p>{source.note}</p>
                </LhContentProse>
              </div>
            ))}
          </div>
        </details>
      </ContentSection>
    </article>
  );
}

function StaticMarkdownActionCaseDetail({
  actionCase,
}: {
  actionCase: Extract<PublicActionCaseDetail, { source: "static" }>["record"] & { kind: "markdown" };
}) {
  const { metadata, brief, evidence } = actionCase;
  const sectionHeadings = actionCase.headings.filter((heading) => heading.level > 1).slice(0, 8);

  return (
    <article data-lh-page="action-read" data-lh-page-archetype="case-workflow" className={`${styles.page} ${styles.detailPage} ${styles.stack}`}>
      <ActionDetailHeader
        title={metadata.title}
        summary={brief.oneLine}
        date={metadata.date}
        status={metadata.status}
        tags={metadata.tags}
        keyPoint={brief.caseQuestion}
        keyMeta={`${metadata.kicker} · ${metadata.owner}`}
      />

      {sectionHeadings.length > 0 && (
        <ContentSection eyebrow="阅读结构" title="案例参悟路径">
          <ol className="grid gap-3 md:grid-cols-2">
            {sectionHeadings.map((heading, index) => (
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

      <ContentSection eyebrow="案例正文" title="最终参悟内容">
        <LhPanel className="p-5 md:p-6">
          <LhContentProse>
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h2>{children}</h2>,
                h2: ({ children }) => <h3>{children}</h3>,
                h3: ({ children }) => <h4>{children}</h4>,
                p: ({ children }) => <p>{children}</p>,
                strong: ({ children }) => <strong>{children}</strong>,
                ul: ({ children }) => <ul>{children}</ul>,
                ol: ({ children }) => <ol>{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                blockquote: ({ children }) => <blockquote>{children}</blockquote>,
                hr: () => <hr />,
              }}
            >
              {actionCase.markdown}
            </ReactMarkdown>
          </LhContentProse>
        </LhPanel>
      </ContentSection>

      <ContentSection eyebrow="来源材料" title="来源材料">
        <details className="rounded-sm border border-dashed border-line-strong bg-surface-quiet p-5">
          <summary className="cursor-pointer text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-primary-text">查看维护字段</summary>
          <div className="mt-5 space-y-5">
            {evidence.sourceMaterials.map((source) => (
              <div key={source.title} className="border-t border-line pt-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-ink">{source.title}</p>
                  <LhChip tone="neutral">{source.type}</LhChip>
                  <LhChip tone="warning">{source.visibility}</LhChip>
                </div>
                <LhContentProse variant="compact" className="mt-2">
                  <p>{source.note}</p>
                </LhContentProse>
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

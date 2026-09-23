/* eslint-disable @next/next/no-img-element -- Resource package images have author-defined dimensions and URLs. */
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { KnowledgeHub } from "@/modules/knowledge-hub/service";
import { articleOutline, resourceSourceLabel } from "./presentation";
import styles from "./knowledge.module.css";

export const resourceLabels = { notice: "通知与规范", case: "案例与复盘", document: "知识文档", skill: "Skill", tool: "工具资源" };
export function ResourceView({ resource, embedded = false }: { resource: Awaited<ReturnType<KnowledgeHub["get"]>>; embedded?: boolean }) {
  const { version } = resource;
  const { titleLine, headings } = articleOutline(version.markdown);
  const base = `/api/resources/${encodeURIComponent(resource.id)}`;
  const fileUrl = (path: string) => `${base}/files?version=${encodeURIComponent(version.id)}&path=${encodeURIComponent(path)}`;
  const resolveUrl = (url: string) => {
    const file = version.files.find(f => f.path === url.replace(/^\.\//, ""));
    return file ? fileUrl(file.path) : url;
  };
  const contents = <ol>{headings.map(h => <li key={h.id} data-depth={h.depth}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>;
  const Title = embedded ? "h2" : "h1";
  const components: Components = {
    h1: ({ node, children }) => node?.position?.start.line === titleLine ? null : <h2 id={`section-${node?.position?.start.line}`}>{children}</h2>,
    h2: ({ node, children }) => <h2 id={`section-${node?.position?.start.line}`}>{children}</h2>,
    h3: ({ node, children }) => <h3 id={`section-${node?.position?.start.line}`}>{children}</h3>,
    a: ({ href, children }) => <a href={href ? resolveUrl(href) : undefined}>{children}</a>,
    img: ({ src, alt }) => {
      const url = typeof src === "string" ? resolveUrl(src) : "";
      return /^(https?:\/\/|\/)/.test(url)
        ? <img src={url} alt={alt === "descript" ? "原文配图" : alt || "原文配图"} loading="lazy" />
        : <span className={styles.imageNotice}>原文配图暂不可用</span>;
    },
    table: ({ children }) => <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="文章表格"><table>{children}</table></div>,
  };
  return <div id="resource-top" className={styles.reader} data-lh-resource data-lh-page-archetype={resource.type === "case" ? "case-workflow" : "cultural-reading"}>
    <nav className={styles.breadcrumb} aria-label="阅读位置"><Link href={resource.type === "case" ? "/action" : "/search"}>← {resource.type === "case" ? "全部案例" : "知识资源"}</Link><span aria-hidden="true">/</span><span>{resourceLabels[resource.type]}</span></nav>
    <div className={styles.readingLayout}>
      <article className={styles.paper}>
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>{resourceLabels[resource.type]}<span />{resourceSourceLabel(resource.source)}</p>
          <Title className={styles.articleTitle}>{resource.title}</Title>
          <div className={styles.metadata}><time dateTime={version.publishedAt ?? undefined}>{version.publishedAt?.slice(0, 10)}</time><span>版本 {version.number}</span>{resource.type === "notice" && <span>{resource.validity === "effective" ? "当前有效" : resource.validity === "expired" ? "已失效" : resource.validity === "scheduled" ? "待生效" : "有效性待确认"}</span>}</div>
          {resource.summary && resource.summary.length < 180 && <p className={styles.lead}>{resource.summary}</p>}
          <div className={styles.readingActions}><a href={`${base}?version=${version.id}&format=md`} download>下载原文 <span aria-hidden="true">↗</span></a><a href="#resource-reference">来源与引用 <span aria-hidden="true">↓</span></a></div>
          {headings.length > 0 && <details className={styles.mobileContents}><summary>本文目录 <span>{headings.length} 个章节</span></summary><nav aria-label="文章目录">{contents}</nav></details>}
        </header>
        <div className={styles.prose} data-lh-article-prose><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{version.markdown}</ReactMarkdown></div>
        <footer className={styles.articleFooter} id="resource-reference">
          <p className={styles.eyebrow}>文档信息</p>
          <p>来源：{resourceSourceLabel(resource.source)} · 版本 {version.number}</p>
          <details className={styles.references}><summary>查看来源与引用位置</summary><dl><dt>原始来源</dt><dd>{resource.source}</dd><dt>资源编号</dt><dd>{resource.id}</dd><dt>版本编号</dt><dd>{version.id}</dd></dl><ol>{version.citations.map(c => <li key={c.id} id={c.id}><strong>{c.heading}</strong><p>第 {c.startLine}–{c.endLine} 行</p><code>{c.id}</code></li>)}</ol></details>
          {version.files.length > 0 && <section className={styles.attachments}><h3>配套文件</h3><ul>{version.files.map(f => <li key={f.path}><a href={fileUrl(f.path)} download>{f.path} <span aria-hidden="true">↗</span></a></li>)}</ul></section>}
        </footer>
      </article>
      <aside className={styles.readingRail}>
        <div className={styles.stickyRail}>
          {headings.length > 0 && <nav className={styles.contents} aria-label="文章目录"><p className={styles.eyebrow}>本文目录</p>{contents}</nav>}
          <div className={styles.railNote}><p>保留当前版本，方便查阅。</p><a href={`${base}?version=${version.id}&format=md`} download>下载 Markdown 原文 ↗</a></div>
          <a className={styles.backTop} href="#resource-top">回到文章顶部 ↑</a>
        </div>
      </aside>
    </div>
  </div>;
}
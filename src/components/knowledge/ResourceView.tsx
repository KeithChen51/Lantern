import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LhContentProse, LhChip } from "@/components/ui/lighthouse-primitives";
import type { KnowledgeHub } from "@/modules/knowledge-hub/service";

export const resourceLabels = { notice: "通知与规范", case: "案例与复盘", document: "知识文档", skill: "Skill", tool: "工具资源" };
export function ResourceView({ resource }: { resource: Awaited<ReturnType<KnowledgeHub["get"]>> }) {
  const { version } = resource;
  const base = `/api/resources/${encodeURIComponent(resource.id)}`;
  const fileUrl = (path: string) => `${base}/files?version=${encodeURIComponent(version.id)}&path=${encodeURIComponent(path)}`;
  const resolveUrl = (url: string) => {
    if (/^(https?:|mailto:|#|\/)/.test(url)) return url;
    const file = version.files.find(f => f.path === url.replace(/^\.\//, ""));
    return file ? fileUrl(file.path) : url;
  };
  return <article data-lh-resource data-lh-page-archetype="cultural-reading" className="space-y-6 pb-12">
    <Link href="/search" className="text-primary hover:underline">返回搜索</Link>
    <header className="space-y-3 border-b border-line pb-5">
      <LhChip>{resourceLabels[resource.type]}</LhChip>
      <h1 className="text-[length:var(--title-section)] font-bold text-ink">{resource.title}</h1>
      {resource.summary && <p className="text-muted">{resource.summary}</p>}
      <p className="text-muted">版本 {version.number} · {version.publishedAt?.slice(0, 10)} · {resource.validity === "effective" ? "当前有效" : resource.validity === "expired" ? "已失效" : resource.validity === "scheduled" ? "待生效" : "有效性未明确"}</p>
      <p className="break-words text-muted">来源：{resource.source}</p>
      <a href={`${base}?version=${version.id}&format=md`} className="text-primary hover:underline">获取 Markdown 原文</a>
    </header>
    <LhContentProse>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href ? resolveUrl(href) : undefined}>{children}</a>, img: ({ src, alt }) => typeof src === "string" ? <a href={resolveUrl(src)} className="text-primary">{alt || "查看图片附件"}</a> : null }}>{version.markdown}</ReactMarkdown>
    </LhContentProse>
    <details className="rounded-lg border border-line p-4">
      <summary className="cursor-pointer font-bold">引用位置</summary>
      <ul className="mt-3 space-y-3">{version.citations.map(c => <li key={c.id} id={c.id}><strong>{c.heading}</strong><p className="break-all text-muted">{resource.id} / {version.id} / {c.id} · 第 {c.startLine}–{c.endLine} 行</p></li>)}</ul>
    </details>
    {version.files.length > 0 && <section><h2 className="font-bold">配套文件</h2><ul>{version.files.map(f => <li key={f.path}><a className="text-primary hover:underline" href={fileUrl(f.path)}>{f.path}</a></li>)}</ul></section>}
  </article>;
}

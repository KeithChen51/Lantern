import Link from "next/link";
import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { resourceLabels } from "@/components/knowledge/ResourceView";
import { getHeaderSearchMatches } from "@/components/layout/header-search";
import { searchSchema } from "@/modules/knowledge-hub/service";
import { plainMarkdown, resourceSourceLabel } from "@/components/knowledge/presentation";
import styles from "@/components/knowledge/knowledge.module.css";
export const dynamic = "force-dynamic";
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const parsed = searchSchema.safeParse({ query, type: params.type || undefined, sort: params.sort || "relevance", offset: Number(params.offset || 0) });
  const options = parsed.success ? parsed.data : searchSchema.parse({});
  let error = !parsed.success ? "查询参数不正确，请调整后重试。" : "";
  let result: Awaited<ReturnType<ReturnType<typeof getKnowledgeHub>["search"]>> | null = null;
  if (parsed.success && isKnowledgeHubEnabled()) {
    try { result = await getKnowledgeHub().search(options); } catch { error = "知识服务暂时不可用，请稍后重试。"; }
  }
  const pageLink = (offset: number) => `/search?${new URLSearchParams({ q: options.query, sort: options.sort, ...(options.type ? { type: options.type } : {}), offset: String(offset) })}`;
  return <div className={styles.searchPage} data-lh-resource-search>
    <header className={styles.searchHeader}><p className={styles.eyebrow}>灯塔 · 知识资源</p><h1>搜索资源</h1><p>查阅通知、案例与白皮书，找到可以引用的依据。</p></header>
    <form action="/search" className={styles.searchForm}>
      <label className="grid flex-1 gap-1">关键词<input name="q" defaultValue={query} placeholder="搜索政策、案例、白皮书…" className="min-w-48 rounded border border-line bg-panel p-3" /></label>
      <label className="grid gap-1">类型<select aria-label="类型" name="type" defaultValue={options.type ?? ""} className="rounded border border-line bg-panel p-3"><option value="">全部</option>{Object.entries(resourceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="grid gap-1">排序<select aria-label="排序" name="sort" defaultValue={options.sort} className="rounded border border-line bg-panel p-3"><option value="relevance">最相关</option><option value="published">最新发布</option><option value="updated">最近更新</option></select></label>
      <button type="submit" className="rounded border border-line bg-primary-soft px-5 py-3 font-bold">搜索</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {!isKnowledgeHubEnabled() && <p className="text-muted">知识资源尚未开放查询，仍可使用下方页面导航。</p>}
    {result && <section className={styles.searchResults} aria-label="知识资源结果"><p className={styles.resultCount}>找到 {result.total} 项资源</p>{result.items.map(item => <article className={styles.resultRow} key={item.id}>
      <p className="text-muted">{resourceLabels[item.type]} · v{item.version} · {item.publishedAt.slice(0, 10)}{item.type === "notice" && item.validity === "unknown" ? " · 有效性未明确" : ""}</p>
      <h2 className="text-[length:var(--title-card)] font-bold"><Link className="hover:underline" href={`/resources/${item.id}?version=${item.versionId}`}>{item.title}</Link></h2>
      <p className={styles.resultExcerpt}>{plainMarkdown(item.summary || item.excerpt)}</p><p className={styles.resultSource}>{resourceSourceLabel(item.source)}</p>
    </article>)}{result.total === 0 && <p>没有匹配的已发布资源，可尝试其他关键词。</p>}
    <nav className="flex gap-5" aria-label="结果分页">{options.offset > 0 && <Link href={pageLink(Math.max(0, options.offset - options.limit))}>上一页</Link>}{options.offset + options.limit < result.total && <Link href={pageLink(options.offset + options.limit)}>下一页</Link>}</nav></section>}
    <section className="space-y-3 border-t border-line pt-5"><h2 className="font-bold">页面导航</h2>{getHeaderSearchMatches(query).map(item => <Link key={item.href} href={item.href} className="mr-5 inline-block text-primary hover:underline">{item.label}</Link>)}</section>
  </div>;
}

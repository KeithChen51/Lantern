import Link from "next/link";
import { Icon } from "@iconify/react";
import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { resourceLabels } from "@/components/knowledge/ResourceView";
import { getHeaderSearchMatches } from "@/components/layout/header-search";
import { searchSchema } from "@/modules/knowledge-hub/service";
import { plainMarkdown, resourceSourceLabel } from "@/components/knowledge/presentation";
import styles from "@/components/knowledge/knowledge.module.css";
import { PageHeading } from "@/components/ui/PageHeading";
import { LhButton } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
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
  const navigationMatches = getHeaderSearchMatches(query);
  return <div className={styles.searchPage} data-lh-resource-search>
    <PageHeading title="知识资源" description="搜索品牌文档、服务案例与可复用的知识。" />
    <form action="/search" className={styles.searchForm}>
      <label className={styles.searchQueryLabel}>
        <span className={styles.visuallyHidden}>关键词</span>
        <span className={styles.searchQueryControl}>
          <input name="q" defaultValue={query} placeholder="搜索政策、案例、白皮书…" aria-label="关键词" />
          <Icon icon={lighthouseIcons.search} aria-hidden="true" />
        </span>
      </label>
      <LhButton type="submit" variant="primary" className={styles.searchSubmit} icon={<Icon icon={lighthouseIcons.search} aria-hidden="true" />}>
        搜索
      </LhButton>
      <details className={styles.searchFilters} open={Boolean(options.type || options.sort !== "relevance")}>
        <summary>筛选与排序</summary>
        <div className={styles.searchFilterFields}>
          <label>类型<select aria-label="类型" name="type" defaultValue={options.type ?? ""}><option value="">全部</option>{Object.entries(resourceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>排序<select aria-label="排序" name="sort" defaultValue={options.sort}><option value="relevance">最相关</option><option value="published">最新发布</option><option value="updated">最近更新</option></select></label>
        </div>
      </details>
    </form>
    {error && <p className={styles.searchMessage} role="alert">{error}</p>}
    {!isKnowledgeHubEnabled() && <p className={styles.searchMessage}>知识资源尚未开放查询，仍可使用下方页面导航。</p>}
    {result && <section className={styles.searchResults} aria-label="知识资源结果"><p className={styles.resultCount}>全部资源 · {result.total} 条结果</p>{result.items.map(item => <article className={styles.resultRow} key={item.id}>
      <p className={styles.resultMeta}>{resourceLabels[item.type]} · v{item.version} · {item.publishedAt.slice(0, 10)}{item.type === "notice" && item.validity === "unknown" ? " · 有效性未明确" : ""}</p>
      <h2><Link href={`/resources/${item.id}?version=${item.versionId}`}>{item.title}</Link></h2>
      <p className={styles.resultExcerpt}>{plainMarkdown(item.summary || item.excerpt)}</p><p className={styles.resultSource}>{resourceSourceLabel(item.source)}</p>
    </article>)}{result.total === 0 && <p className={styles.searchEmpty}>没有匹配的已发布资源，可尝试其他关键词。</p>}
    <nav className={styles.pagination} aria-label="结果分页">{options.offset > 0 && <Link href={pageLink(Math.max(0, options.offset - options.limit))}>上一页</Link>}{options.offset + options.limit < result.total && <Link href={pageLink(options.offset + options.limit)}>下一页</Link>}</nav></section>}
    {navigationMatches.length > 0 && <section className={styles.searchNavigation}><h2>页面导航</h2>{navigationMatches.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}</section>}
  </div>;
}

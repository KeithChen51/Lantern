import { authFetch } from "@/components/auth/auth-fetch";
import { getHermitApiError, type HermitDocumentRecommendation } from "./types";

export type ContextResourceKind = "knowledge" | "skill";
export type ContextResource = {
  id: string; versionId: string; title: string; source: string;
  type: "notice" | "case" | "document" | "skill"; summary: string; score?: number;
};
const PAGE_SIZE = 12;

/** Query each supported resource type so pagination never produces a falsely empty filtered page. */
export async function readContextResources(kind: ContextResourceKind, query: string, page: number, signal: AbortSignal) {
  const types = kind === "skill" ? ["skill"] : ["document", "case", "notice"];
  const results = await Promise.all(types.map(async type => {
    const params = new URLSearchParams({ q: query.trim(), type, offset: String(page * PAGE_SIZE), limit: String(PAGE_SIZE) });
    const response = await authFetch(`/api/resources?${params}`, { signal });
    if (!response.ok) throw new Error(getHermitApiError(await response.json().catch(() => null), "暂时无法读取内容，请重试。"));
    return await response.json() as { items: ContextResource[]; total: number };
  }));
  return {
    items: results.flatMap(result => result.items).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    hasMore: results.some(result => result.total > (page + 1) * PAGE_SIZE),
  };
}

export function contextFromResource(resource: ContextResource): HermitDocumentRecommendation {
  return { id: `context:${resource.id}:${resource.versionId}`, resourceId: resource.id, versionId: resource.versionId, title: resource.title, source: resource.source };
}

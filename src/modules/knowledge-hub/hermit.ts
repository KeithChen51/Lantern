import { createHash } from "node:crypto";
import { embedText, emptySearchResult, formatRagContext, readEmbeddingConfig, selectRelevantKnowledge, type KnowledgeChunk, type RagSearchResult } from "@/lib/hermit/rag";
import { getKnowledgeHub } from "./runtime";
import { queryTerms } from "./service";

const vectors = new Map<string, number[]>();
export async function searchHubForHermit(query: string, topK: number): Promise<RagSearchResult> {
  if (!query.trim()) return emptySearchResult(query);
  const hub = getKnowledgeHub();
  const candidates = await hub.search({ query, limit: 8 });
  if (!candidates.items.length) return emptySearchResult(query);
  const terms = queryTerms(query);
  const chunks: KnowledgeChunk[] = [];
  const model = readEmbeddingConfig().model;
  const queryVector = await embedText(query);
  for (const item of candidates.items) {
    const resource = await hub.get(item.id, item.versionId);
    const relevant = [...resource.version.citations].sort((a, b) => terms.filter(t => b.text.toLowerCase().includes(t)).length - terms.filter(t => a.text.toLowerCase().includes(t)).length).slice(0, 3);
    for (const citation of relevant) {
      const text = `${citation.heading}\n${citation.text}`;
      const key = `${readEmbeddingConfig().baseUrl}:${model}:${createHash("sha256").update(text).digest("hex")}`;
      let vector = vectors.get(key);
      if (!vector) {
        vector = await embedText(text);
        if (vectors.size >= 1000) vectors.delete(vectors.keys().next().value!);
        vectors.set(key, vector);
      }
      if (vector.length !== queryVector.length) throw new Error("Knowledge embedding dimensions do not match");
      chunks.push({ id: citation.id, source: `资源 ${item.id} / 版本 ${item.versionId} / 第${citation.startLine}-${citation.endLine}行 / ${item.source}`, sourceType: item.type === "notice" ? "norm_file" : item.type === "case" ? "action_case" : "manual", evidenceTier: item.type === "notice" && item.validity === "effective" ? "exact" : "analogous", heading: citation.heading, content: citation.text, vector });
    }
  }
  const selected = selectRelevantKnowledge({ model, dimension: queryVector.length, chunks }, queryVector, query, { topK });
  return { ...selected, contextText: formatRagContext(selected), sourceSnapshot: { decision: selected.decision, sources: selected.chunks.map(({ chunk, score, evidenceTier }) => ({ id: chunk.id, source: chunk.source, sourceType: chunk.sourceType ?? "unknown", heading: chunk.heading, score, evidenceTier })) } };
}

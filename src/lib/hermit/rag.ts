/**
 * Hermit RAG Module
 *
 * Loads pre-built knowledge vectors and performs gated cosine-similarity
 * retrieval for the LLM.
 */

import type { KnowledgeEvidenceTier, KnowledgeSourceType } from "./knowledge-builder";

export interface KnowledgeChunk {
  id: string;
  source: string;
  sourceType?: KnowledgeSourceType;
  evidenceTier?: KnowledgeEvidenceTier;
  heading: string;
  content: string;
  vector: number[];
}

export interface KnowledgeIndex {
  model: string;
  dimension: number;
  chunks: KnowledgeChunk[];
}

export type RagRetrievalStatus = "accepted" | "insufficient" | "out_of_domain";

export type RagRetrievalDecision = {
  status: RagRetrievalStatus;
  domainMatched: boolean;
  topScore: number;
  minScore: number;
  strongScore: number;
  evidenceTier: KnowledgeEvidenceTier | "insufficient" | "out_of_domain";
  reason: string;
};

export type ScoredKnowledgeChunk = {
  chunk: KnowledgeChunk;
  score: number;
  evidenceTier: KnowledgeEvidenceTier;
};

export type RagSearchResult = {
  contextText: string;
  chunks: ScoredKnowledgeChunk[];
  decision: RagRetrievalDecision;
  sourceSnapshot: {
    decision: RagRetrievalDecision;
    sources: Array<{
      id: string;
      source: string;
      sourceType: KnowledgeSourceType | "unknown";
      heading: string;
      score: number;
      evidenceTier: KnowledgeEvidenceTier;
    }>;
  };
};

export type RagRetrievalOptions = {
  topK?: number;
  minScore?: number;
  strongScore?: number;
  outOfDomainScore?: number;
  domainTerms?: string[];
};

const DEFAULT_EMBEDDING_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_RAG_MIN_SCORE = 0.55;
const DEFAULT_RAG_STRONG_SCORE = 0.75;
const DEFAULT_RAG_OUT_OF_DOMAIN_SCORE = 0.8;

const SERVICE_DOMAIN_TERMS = [
  "服务",
  "客户",
  "用户",
  "车主",
  "门店",
  "经销商",
  "售后",
  "维修",
  "保养",
  "交车",
  "接车",
  "取送车",
  "等待",
  "投诉",
  "抱怨",
  "回访",
  "服务顾问",
  "索赔",
  "客休",
  "工单",
  "SOP",
  "规范",
  "标准",
  "案例",
  "Action",
  "Workshop",
  "真",
  "善",
  "美",
  "爱",
  "service",
  "customer",
  "dealer",
  "workshop",
  "after-sales",
  "advisor",
  "handover",
  "complaint",
  "follow-up",
  "repair",
];

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function readNumber(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readEmbeddingConfig(env: Record<string, string | undefined> = process.env) {
  return {
    baseUrl: env.EMBEDDING_BASE_URL || DEFAULT_EMBEDDING_BASE_URL,
    apiKey: env.EMBEDDING_API_KEY || env.OPENAI_API_KEY || "",
    model: env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
  };
}

export function readRagRetrievalConfig(
  env: Record<string, string | undefined> = process.env,
): Required<Pick<RagRetrievalOptions, "minScore" | "strongScore" | "outOfDomainScore">> {
  return {
    minScore: readNumber(env.HERMIT_RAG_MIN_SCORE, DEFAULT_RAG_MIN_SCORE),
    strongScore: readNumber(env.HERMIT_RAG_STRONG_SCORE, DEFAULT_RAG_STRONG_SCORE),
    outOfDomainScore: readNumber(env.HERMIT_RAG_OUT_OF_DOMAIN_SCORE, DEFAULT_RAG_OUT_OF_DOMAIN_SCORE),
  };
}

export function assertCompatibleEmbeddingIndex(
  kb: KnowledgeIndex,
  queryVector: number[],
  embeddingModel: string,
) {
  if (kb.model !== embeddingModel) {
    throw new Error(
      `[Hermit RAG] Embedding model mismatch: knowledge index was built with "${kb.model}" but runtime EMBEDDING_MODEL is "${embeddingModel}". Rebuild the index or set the same embedding model at runtime.`,
    );
  }

  if (kb.dimension !== queryVector.length) {
    throw new Error(
      `[Hermit RAG] Embedding dimension mismatch: knowledge index dimension is ${kb.dimension} but runtime query vector dimension is ${queryVector.length}.`,
    );
  }

  const mismatchedChunk = kb.chunks.find((chunk) => chunk.vector.length !== kb.dimension);
  if (mismatchedChunk) {
    throw new Error(
      `[Hermit RAG] Knowledge chunk "${mismatchedChunk.id}" has vector dimension ${mismatchedChunk.vector.length}; expected ${kb.dimension}.`,
    );
  }
}

function hasServiceDomainSignal(query: string, domainTerms = SERVICE_DOMAIN_TERMS) {
  const normalized = query.toLowerCase();
  return domainTerms.some((term) => normalized.includes(term.toLowerCase()));
}

function inferChunkEvidenceTier(
  chunk: KnowledgeChunk,
  score: number,
  strongScore: number,
): KnowledgeEvidenceTier {
  if (score < strongScore) return "analogous";
  if (chunk.evidenceTier) return chunk.evidenceTier;

  return chunk.sourceType === "workshop_guide" ||
    chunk.sourceType === "action_case" ||
    chunk.sourceType === "norm_file"
    ? "exact"
    : "analogous";
}

function bestEvidenceTier(chunks: ScoredKnowledgeChunk[]): KnowledgeEvidenceTier {
  return chunks.some((item) => item.evidenceTier === "exact") ? "exact" : "analogous";
}

export function selectRelevantKnowledge(
  kb: KnowledgeIndex,
  queryVector: number[],
  query: string,
  options: RagRetrievalOptions = {},
): Omit<RagSearchResult, "contextText" | "sourceSnapshot"> {
  const config = readRagRetrievalConfig();
  const topK = options.topK ?? 3;
  const minScore = options.minScore ?? config.minScore;
  const strongScore = options.strongScore ?? config.strongScore;
  const outOfDomainScore = options.outOfDomainScore ?? config.outOfDomainScore;
  const domainMatched = hasServiceDomainSignal(query, options.domainTerms);

  const scored = kb.chunks
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryVector, chunk.vector),
    }))
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  if (!domainMatched && topScore < outOfDomainScore) {
    return {
      chunks: [],
      decision: {
        status: "out_of_domain",
        domainMatched,
        topScore,
        minScore,
        strongScore,
        evidenceTier: "out_of_domain",
        reason: "Query has no service-domain signal and no strong semantic match.",
      },
    };
  }

  const chunks = scored
    .filter((item) => item.score >= minScore)
    .slice(0, topK)
    .map((item) => ({
      ...item,
      evidenceTier: inferChunkEvidenceTier(item.chunk, item.score, strongScore),
    }));

  if (chunks.length === 0) {
    return {
      chunks,
      decision: {
        status: "insufficient",
        domainMatched,
        topScore,
        minScore,
        strongScore,
        evidenceTier: "insufficient",
        reason: "No retrieved chunk met the minimum relevance score.",
      },
    };
  }

  const evidenceTier = bestEvidenceTier(chunks);
  return {
    chunks,
    decision: {
      status: "accepted",
      domainMatched,
      topScore,
      minScore,
      strongScore,
      evidenceTier,
      reason:
        evidenceTier === "exact"
          ? "Retrieved evidence includes published practice, Action, or norm sources above threshold."
          : "Retrieved evidence is relevant but should be treated as analogous support.",
    },
  };
}

function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}

export function formatRagContext(result: Omit<RagSearchResult, "contextText" | "sourceSnapshot">): string {
  if (result.decision.status !== "accepted") {
    return "";
  }

  const header = [
    "## RAG 检索判定",
    `状态：${result.decision.status}`,
    `证据等级：${result.decision.evidenceTier}`,
    `最高相关度：${formatScore(result.decision.topScore)}`,
    `说明：${result.decision.reason}`,
  ].join("\n");

  const chunks = result.chunks
    .map(
      ({ chunk, score, evidenceTier }) =>
        `### ${chunk.heading}\n来源：${chunk.source}\n类型：${chunk.sourceType ?? "unknown"}\n证据等级：${evidenceTier}\n相关度：${formatScore(score)}\n\n${chunk.content}`,
    )
    .join("\n\n---\n\n");

  return `${header}\n\n${chunks}`;
}

function buildSourceSnapshot(
  result: Omit<RagSearchResult, "contextText" | "sourceSnapshot">,
): RagSearchResult["sourceSnapshot"] {
  return {
    decision: result.decision,
    sources: result.chunks.map(({ chunk, score, evidenceTier }) => ({
      id: chunk.id,
      source: chunk.source,
      sourceType: chunk.sourceType ?? "unknown",
      heading: chunk.heading,
      score,
      evidenceTier,
    })),
  };
}

export async function embedText(text: string): Promise<number[]> {
  const config = readEmbeddingConfig();
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const url = baseUrl.endsWith("/embeddings")
    ? baseUrl
    : `${baseUrl}/embeddings`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.data[0].embedding as number[];
}

let knowledgeBase: KnowledgeIndex | null = null;

export async function loadKnowledgeBase(): Promise<KnowledgeIndex | null> {
  if (knowledgeBase) return knowledgeBase;
  try {
    const data = await import("./knowledge/knowledge-vectors.json");
    knowledgeBase = data.default as unknown as KnowledgeIndex;
    return knowledgeBase;
  } catch {
    console.warn("[Hermit RAG] knowledge-vectors.json not found. RAG disabled.");
    return null;
  }
}

function emptySearchResult(query: string): RagSearchResult {
  const config = readRagRetrievalConfig();
  const decision: RagRetrievalDecision = {
    status: "insufficient",
    domainMatched: hasServiceDomainSignal(query),
    topScore: 0,
    minScore: config.minScore,
    strongScore: config.strongScore,
    evidenceTier: "insufficient",
    reason: "Knowledge index is missing or empty.",
  };
  return {
    contextText: "",
    chunks: [],
    decision,
    sourceSnapshot: { decision, sources: [] },
  };
}

export async function searchKnowledgeDetailed(query: string, topK: number = 3): Promise<RagSearchResult> {
  const kb = await loadKnowledgeBase();
  if (!kb || kb.chunks.length === 0) return emptySearchResult(query);

  const queryVec = await embedText(query);
  assertCompatibleEmbeddingIndex(kb, queryVec, readEmbeddingConfig().model);

  const selected = selectRelevantKnowledge(kb, queryVec, query, { topK });
  return {
    ...selected,
    contextText: formatRagContext(selected),
    sourceSnapshot: buildSourceSnapshot(selected),
  };
}

export async function searchKnowledge(
  query: string,
  topK: number = 3
): Promise<string> {
  const result = await searchKnowledgeDetailed(query, topK);
  return result.contextText;
}

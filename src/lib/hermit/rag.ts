import fs from "fs";
import path from "path";

/* ── types ── */

interface KnowledgeChunk {
  id: string;
  source: string;
  heading: string;
  content: string;
  vector: number[];
}

interface KnowledgeIndex {
  model: string;
  dimension: number;
  chunks: KnowledgeChunk[];
}

/* ── vector math ── */

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

/* ── embedding ── */

const EMBEDDING_BASE_URL =
  process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1";
const EMBEDDING_API_KEY =
  process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || "";
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "text-embedding-3-small";

/**
 * Call the configurable Embedding API (any OpenAI-compatible endpoint).
 */
export async function embedText(text: string): Promise<number[]> {
  const baseUrl = EMBEDDING_BASE_URL.replace(/\/+$/, "");
  const url = baseUrl.endsWith("/embeddings")
    ? baseUrl
    : `${baseUrl}/embeddings`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
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

/* ── knowledge base ── */

const VECTORS_PATH = path.join(
  process.cwd(),
  "src/lib/hermit/knowledge/knowledge-vectors.json"
);

let knowledgeBase: KnowledgeIndex | null = null;

/**
 * Load the pre-built knowledge vectors into memory.
 */
export function loadKnowledgeBase(): KnowledgeIndex | null {
  if (knowledgeBase) return knowledgeBase;
  try {
    const raw = fs.readFileSync(VECTORS_PATH, "utf-8");
    knowledgeBase = JSON.parse(raw) as KnowledgeIndex;
    return knowledgeBase;
  } catch {
    console.warn(
      "[Hermit RAG] knowledge-vectors.json not found. RAG disabled."
    );
    return null;
  }
}

/**
 * Search the knowledge base by cosine similarity.
 * Returns the top-K most relevant chunks concatenated as a string.
 */
export async function searchKnowledge(
  query: string,
  topK: number = 3
): Promise<string> {
  const kb = loadKnowledgeBase();
  if (!kb || kb.chunks.length === 0) return "";

  const queryVec = await embedText(query);

  const scored = kb.chunks
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryVec, chunk.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored
    .map(
      ({ chunk, score }) =>
        `### ${chunk.heading}\n来源：${chunk.source}\n相关度：${(score * 100).toFixed(1)}%\n\n${chunk.content}`
    )
    .join("\n\n---\n\n");
}

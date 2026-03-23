/**
 * Knowledge Base Builder
 *
 * Reads Markdown files from src/lib/hermit/knowledge/,
 * splits them into chunks, generates embeddings via the configured API,
 * and saves the result as knowledge-vectors.json.
 *
 * Usage:
 *   npx tsx scripts/build-knowledge.ts
 *
 * Environment variables (loaded from .env.local):
 *   EMBEDDING_API_KEY   – API key for the embedding service
 *   EMBEDDING_BASE_URL  – Base URL (default: https://api.openai.com/v1)
 *   EMBEDDING_MODEL     – Model name (default: text-embedding-3-small)
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const KNOWLEDGE_DIR = path.join(
  process.cwd(),
  "src/lib/hermit/knowledge"
);
const OUTPUT_PATH = path.join(KNOWLEDGE_DIR, "knowledge-vectors.json");

const BASE_URL =
  process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1";
const API_KEY =
  process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || "";
const MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

/* ── types ── */

interface Chunk {
  id: string;
  source: string;
  heading: string;
  content: string;
}

/* ── markdown splitting ── */

function splitMarkdown(text: string, source: string): Chunk[] {
  const chunks: Chunk[] = [];
  // Split on level-2 headings (##)
  const sections = text.split(/^## /m);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    // First section (before any ##) uses the H1 or filename as heading
    let heading: string;
    let content: string;

    if (i === 0) {
      // Try to extract H1
      const h1Match = section.match(/^# (.+)/m);
      heading = h1Match ? h1Match[1].trim() : source;
      content = section.replace(/^# .+\n?/, "").trim();
    } else {
      // The heading is the first line
      const lines = section.split("\n");
      heading = lines[0].trim();
      content = lines.slice(1).join("\n").trim();
    }

    // Skip empty or very short chunks
    if (content.length < 20) continue;

    // Further split if chunk is too long (> 1000 chars)
    if (content.length > 1000) {
      const subSections = content.split(/^### /m);
      for (let j = 0; j < subSections.length; j++) {
        const sub = subSections[j].trim();
        if (sub.length < 20) continue;

        let subHeading: string;
        let subContent: string;
        if (j === 0) {
          subHeading = heading;
          subContent = sub;
        } else {
          const subLines = sub.split("\n");
          subHeading = `${heading} > ${subLines[0].trim()}`;
          subContent = subLines.slice(1).join("\n").trim();
        }

        chunks.push({
          id: `${source}#${chunks.length}`,
          source,
          heading: subHeading,
          content: subContent,
        });
      }
    } else {
      chunks.push({
        id: `${source}#${chunks.length}`,
        source,
        heading,
        content,
      });
    }
  }

  return chunks;
}

/* ── embedding API ── */

async function embed(texts: string[]): Promise<number[][]> {
  console.log(`  Embedding ${texts.length} chunk(s) via ${MODEL}...`);

  const baseUrl = BASE_URL.replace(/\/+$/, "");
  const url = baseUrl.endsWith("/embeddings")
    ? baseUrl
    : `${baseUrl}/embeddings`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.data
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);
}

/* ── main ── */

async function main() {
  console.log("🔧 Hermit Knowledge Base Builder\n");
  console.log(`  Embedding API: ${BASE_URL}`);
  console.log(`  Model:         ${MODEL}\n`);

  // Find all .md files in knowledge dir
  const files = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    console.log("⚠️  No markdown files found in knowledge directory.");
    return;
  }

  console.log(`📄 Found ${files.length} knowledge file(s):\n`);

  const allChunks: Chunk[] = [];

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const text = fs.readFileSync(filePath, "utf-8");
    const chunks = splitMarkdown(text, file.replace(".md", ""));
    console.log(`  ${file} → ${chunks.length} chunk(s)`);
    allChunks.push(...chunks);
  }

  console.log(`\n📊 Total: ${allChunks.length} chunks\n`);

  // Generate embeddings (batch)
  const texts = allChunks.map(
    (c) => `${c.heading}\n\n${c.content}`
  );

  const vectors = await embed(texts);

  // Build index
  const index = {
    model: MODEL,
    dimension: vectors[0]?.length || 0,
    chunks: allChunks.map((chunk, i) => ({
      ...chunk,
      vector: vectors[i],
    })),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2), "utf-8");
  console.log(
    `\n✅ Saved ${index.chunks.length} vectors (dim=${index.dimension}) → knowledge-vectors.json`
  );
}

main().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});

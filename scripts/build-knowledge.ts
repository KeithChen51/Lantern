/**
 * Knowledge Base Builder
 *
 * Builds Hermit retrieval vectors from static knowledge files, static Action
 * cases, and optionally published database content when DATABASE_URL is set.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ContentStatus, ContentType, PrismaClient } from "@prisma/client";
import { ACTION_CASES, isMarkdownActionCase, isStructuredActionCase } from "../src/app/action/action-cases";
import {
  buildKnowledgeChunks,
  formatActionCaseKnowledgeDocuments,
  formatContentItemKnowledgeDocument,
  formatMarkdownKnowledgeDocument,
  type KnowledgeSourceDocument,
  type KnowledgeSourceType,
} from "../src/lib/hermit/knowledge-builder";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const KNOWLEDGE_DIR = path.join(process.cwd(), "src/lib/hermit/knowledge");
const OUTPUT_PATH = path.join(KNOWLEDGE_DIR, "knowledge-vectors.json");
const BASE_URL = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1";
const API_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || "";
const MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const REQUIRE_DATABASE = process.env.HERMIT_KNOWLEDGE_REQUIRE_DATABASE === "true";

const CONTENT_TYPE_TO_SOURCE_TYPE: Partial<Record<ContentType, KnowledgeSourceType>> = {
  [ContentType.HEART]: "heart",
  [ContentType.MIRROR_CASE]: "mirror_case",
  [ContentType.ACTION_CASE]: "action_case",
  [ContentType.NORM_FILE]: "norm_file",
  [ContentType.TRAINING]: "training",
};

const STATIC_EXTRA_MARKDOWN_FILES: Array<{ filePath: string; sourceType: KnowledgeSourceType; sourceLabel: string }> = [
  {
    filePath: path.join(process.cwd(), "public/胖东来企业全面调研报告.md"),
    sourceType: "mirror_case",
    sourceLabel: "Mirror 调研资料",
  },
];

function relativeId(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/").replace(/\.md$/i, "");
}

function extractTitle(markdown: string, filePath: string) {
  const h1 = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return h1 || path.basename(filePath, path.extname(filePath));
}

function inferKnowledgeFileSourceType(fileName: string): KnowledgeSourceType {
  if (fileName.includes("heart")) return "heart";
  if (fileName.includes("mirror") || fileName.includes("pang-dong-lai")) return "mirror_case";
  if (fileName.includes("sop") || fileName.includes("norm")) return "norm_file";
  return "manual";
}

function readMarkdownFile(filePath: string, sourceType: KnowledgeSourceType, sourceLabel: string) {
  const content = fs.readFileSync(filePath, "utf-8");
  const title = extractTitle(content, filePath);
  return formatMarkdownKnowledgeDocument({
    id: `file:${relativeId(filePath)}`,
    source: `${sourceLabel} / ${title}`,
    sourceType,
    evidenceTier: sourceType === "norm_file" ? "exact" : "analogous",
    title,
    content,
  });
}

function readMarkdownDirectory(dirPath: string, sourceLabel: string): KnowledgeSourceDocument[] {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) =>
      readMarkdownFile(path.join(dirPath, fileName), inferKnowledgeFileSourceType(fileName), sourceLabel),
    );
}

function readStaticMarkdownDocuments(): KnowledgeSourceDocument[] {
  const documents = [
    ...readMarkdownDirectory(KNOWLEDGE_DIR, "Hermit 静态知识"),
    ...readMarkdownDirectory(path.join(process.cwd(), "docs/brand"), "品牌规范文件"),
  ];

  for (const source of STATIC_EXTRA_MARKDOWN_FILES) {
    if (fs.existsSync(source.filePath)) {
      documents.push(readMarkdownFile(source.filePath, source.sourceType, source.sourceLabel));
    }
  }

  return documents;
}

async function readDatabaseKnowledgeDocuments(): Promise<KnowledgeSourceDocument[]> {
  if (!process.env.DATABASE_URL) return [];

  const prisma = new PrismaClient();
  try {
    const contentItems = await prisma.contentItem.findMany({
      where: {
        status: ContentStatus.PUBLISHED,
        publishedVersionId: { not: null },
        contentType: {
          in: [
            ContentType.HEART,
            ContentType.MIRROR_CASE,
            ContentType.ACTION_CASE,
            ContentType.NORM_FILE,
            ContentType.TRAINING,
          ],
        },
      },
      include: { publishedVersion: true },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    });

    return contentItems.flatMap((item) => {
      const sourceType = CONTENT_TYPE_TO_SOURCE_TYPE[item.contentType];
      if (!sourceType) return [];
      const version = item.publishedVersion;
      if (!version?.bodyMarkdown.trim()) return [];
      return [
        formatContentItemKnowledgeDocument({
          id: item.id,
          title: version.title || item.title,
          contentType: sourceType,
          bodyMarkdown: version.bodyMarkdown,
          updatedAt: item.updatedAt,
        }),
      ];
    });
  } catch (error) {
    if (REQUIRE_DATABASE) throw error;
    console.warn("[Hermit Knowledge] Database sources skipped:", error);
    return [];
  } finally {
    await prisma.$disconnect();
  }
}

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

async function main() {
  console.log("Hermit Knowledge Base Builder\n");
  console.log(`  Embedding API: ${BASE_URL}`);
  console.log(`  Model:         ${MODEL}\n`);

  const documents = [
    ...readStaticMarkdownDocuments(),
    ...formatActionCaseKnowledgeDocuments(ACTION_CASES.filter(isStructuredActionCase)),
    ...ACTION_CASES.filter(isMarkdownActionCase).map((actionCase) =>
      formatMarkdownKnowledgeDocument({
        id: `action-case:${actionCase.slug}`,
        source: `Action 案例库 / ${actionCase.metadata.title}`,
        sourceType: "action_case",
        evidenceTier: actionCase.metadata.status === "published" ? "exact" : "analogous",
        title: actionCase.metadata.title,
        content: actionCase.markdown,
      }),
    ),
    ...(await readDatabaseKnowledgeDocuments()),
  ];

  const chunks = buildKnowledgeChunks(documents);
  if (chunks.length === 0) {
    console.log("No knowledge chunks found.");
    return;
  }

  console.log(`  Documents: ${documents.length}`);
  console.log(`  Chunks:    ${chunks.length}\n`);

  const texts = chunks.map(
    (chunk) =>
      `${chunk.heading}\nSource: ${chunk.source}\nType: ${chunk.sourceType}\nEvidence: ${chunk.evidenceTier}\n\n${chunk.content}`,
  );

  const vectors = await embed(texts);
  const index = {
    model: MODEL,
    dimension: vectors[0]?.length || 0,
    chunks: chunks.map((chunk, index) => ({
      ...chunk,
      vector: vectors[index],
    })),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2), "utf-8");
  console.log(`\nSaved ${index.chunks.length} vectors (dim=${index.dimension}) to knowledge-vectors.json`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});

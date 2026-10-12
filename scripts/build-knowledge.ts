/**
 * Verify the static text sources that are available to the knowledge hub.
 *
 * Knowledge is imported into the hub and read progressively through the hub
 * index at runtime. The build must stay deterministic and must not call an
 * embedding service or materialize a vector cache.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  ACTION_CASES,
  isMarkdownActionCase,
  isStructuredActionCase,
} from "../src/app/action/action-cases";
import {
  formatActionCaseKnowledgeDocuments,
  formatMarkdownKnowledgeDocument,
  type KnowledgeSourceDocument,
  type KnowledgeSourceType,
} from "../src/lib/hermit/knowledge-builder";

const KNOWLEDGE_DIR = path.join(process.cwd(), "src/lib/hermit/knowledge");

const STATIC_EXTRA_MARKDOWN_FILES: Array<{
  filePath: string;
  sourceType: KnowledgeSourceType;
  sourceLabel: string;
}> = [
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

function readMarkdownFile(
  filePath: string,
  sourceType: KnowledgeSourceType,
  sourceLabel: string,
): KnowledgeSourceDocument {
  const content = fs.readFileSync(filePath, "utf8");
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

function readMarkdownDirectory(dirPath: string, sourceLabel: string) {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) =>
      readMarkdownFile(
        path.join(dirPath, fileName),
        inferKnowledgeFileSourceType(fileName),
        sourceLabel,
      ),
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

function readStaticActionDocuments(): KnowledgeSourceDocument[] {
  return [
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
  ];
}

function verifyDocuments(documents: KnowledgeSourceDocument[]) {
  const invalid = documents.filter(
    (document) => !document.id.trim() || !document.title.trim() || !document.content.trim(),
  );
  if (invalid.length > 0) {
    throw new Error(
      `Knowledge source check failed: ${invalid.map((document) => document.id || "<unknown>").join(", ")}`,
    );
  }
}

function main() {
  const documents = [...readStaticMarkdownDocuments(), ...readStaticActionDocuments()];
  verifyDocuments(documents);

  const characters = documents.reduce((total, document) => total + document.content.length, 0);
  console.log(
    `[Lantern Knowledge] Verified ${documents.length} static text source(s) (${characters} characters). ` +
      "Runtime access uses the indexed knowledge hub; no embedding API or vector cache is required.",
  );
}

try {
  main();
} catch (error) {
  console.error("Knowledge source check failed:", error);
  process.exitCode = 1;
}

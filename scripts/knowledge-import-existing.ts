import "./knowledge-env";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { ACTION_CASES, isMarkdownActionCase } from "../src/app/action/action-cases";
import { prisma } from "../src/infrastructure/db";
import { getKnowledgeHub } from "../src/modules/knowledge-hub/runtime";
import { importSchema } from "../src/modules/knowledge-hub/service";

async function main() {
  const { values } = parseArgs({ options: { publish: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false } } });
  const whitepaperPath = "docs/brand/精诚服务品牌价值观纲领白皮书.md";
  const whitepaper = await readFile(whitepaperPath, "utf8");
  const inputs = [importSchema.parse({ id: "brand-whitepaper", type: "document", title: whitepaper.match(/^#\s+(.+)$/m)?.[1] || "精诚服务品牌价值观纲领白皮书", markdown: whitepaper, source: whitepaperPath, tags: ["白皮书", "官方理念"] })];
  for (const item of ACTION_CASES.filter(isMarkdownActionCase)) {
    const sourcePath = item.evidence.sourceMaterials.find(source => source.path)?.path;
    if (!sourcePath) throw new Error(`Missing canonical source for ${item.slug}`);
    const markdown = await readFile(sourcePath, "utf8");
    inputs.push(importSchema.parse({ id: `case-${item.slug}`, type: "case", title: item.metadata.title, markdown, summary: item.brief.oneLine, tags: item.metadata.tags, source: sourcePath, businessScope: "汽车售后服务" }));
  }
  const guidePath = "docs/brand/精诚服务 (The Genuine Way) 品牌价值观框架与落地指南.md";
  const guide = await readFile(guidePath, "utf8");
  inputs.push(importSchema.parse({ id: "brand-guide", type: "document", title: guide.match(/^#\s+(.+)$/m)?.[1] || "精诚服务品牌价值观框架与落地指南", markdown: guide, source: guidePath }));
  const knowledgeDir = "src/lib/hermit/knowledge";
  for (const file of (await readdir(knowledgeDir)).filter(f => f.endsWith(".md"))) {
    const markdown = await readFile(path.join(knowledgeDir, file), "utf8");
    inputs.push(importSchema.parse({ id: `knowledge-${file.replace(/\.md$/, "")}`, type: file.includes("sop") || file.includes("norm") ? "notice" : "document", title: markdown.match(/^#\s+(.+)$/m)?.[1] || file, markdown, source: `${knowledgeDir}/${file}` }));
  }
  if (values["dry-run"]) { console.log(JSON.stringify(inputs.map(x => ({ id: x.id, type: x.type, title: x.title, source: x.source })), null, 2)); return; }
  const hub = getKnowledgeHub();
  for (const input of inputs) {
    // Migration is one-way. Never overwrite a resource maintained in the hub.
    const existing = await prisma.hubResource.findUnique({ where: { id: input.id }, select: { id: true } });
    if (existing) { console.log(JSON.stringify({ id: input.id, skipped: true, reason: "already managed in hub" })); continue; }
    const result = await hub.import(input);
    if (values.publish) await hub.publish(result.resourceId, result.versionId);
    console.log(JSON.stringify({ ...result, published: values.publish }));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Import failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());

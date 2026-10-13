import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { FINAL_CANWU_ACTION_CASES } from "../../app/action/final-canwu-action-cases";
import { bundledStandardizeSkill } from "./bundled-skill";
import { importSchema } from "./service";
import { skillInput } from "./upload";

export type InitialContent = z.output<typeof importSchema>;
export const INITIAL_CASE_SLUGS = [
  "integrity-product-control", "driver-partner-rest-area", "pickup-delivery-complaint-principles",
  "advisor-meal-at-reception-desk", "workshop-cooling-investment", "customer-lounge-stairs-space-use",
  "advisor-backroom-professional-space", "tea-table-outlet-proactive-service", "customer-lounge-sales-boundary",
  "maintenance-cycle-bundling", "permission-threshold-regional-standards", "converted-store-hard-decoration-renovation",
  "adjacent-brand-store-merged-operations", "service-staff-body-camera", "commercial-and-private-vehicle-service-channels",
  "holiday-atmosphere-customization", "jingcheng-bar-standard-under-pressure", "extreme-weather-rescue-employee-support",
] as const;
export const CASE_INSIGHT_FILES = [
  "SKILL.md", "references/value-framework.md", "references/restoration-notes.md",
  "references/charging-pile-case.md", "references/case-index.md", "references/01-partner-rest-area.md",
  "references/02-compensation-boundaries.md", "references/03-employee-meal-space.md",
  "references/04-lounge-socket-risk.md", "references/05-catalytic-converter-cleaning.md",
  "references/06-hybrid-maintenance-cycle.md",
] as const;

export async function bundledCaseInsightSkill(root = process.cwd()): Promise<InitialContent> {
  const directory = path.join(root, "skills", "case-insight");
  // An explicit allowlist keeps machine files and adjacent restoration helpers out.
  for (const name of [directory, path.join(directory, "references")]) {
    const entry = await lstat(name);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("Bundled case-insight directory must be a regular directory");
  }
  const entries = [];
  for (const name of CASE_INSIGHT_FILES) {
    const filename = path.join(directory, name);
    const entry = await lstat(filename);
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`Bundled case-insight file must be regular: ${name}`);
    entries.push({ path: name, bytes: await readFile(filename) });
  }
  const { request } = skillInput(entries, "case-insight");
  return importSchema.parse({ ...request, id: "case-insight", title: "精诚服务案例参悟 Skill",
    source: "skills/case-insight (还原来源见 references/restoration-notes.md)",
    tags: ["内置", "参悟案例", "案例写作"], visibility: "public" });
}

/** Approved first-install inventory only; never reconcile it with a live hub. */
export async function loadInitialContent(root = process.cwd()): Promise<InitialContent[]> {
  const whitepaperSource = "docs/brand/精诚服务品牌价值观纲领白皮书.md";
  const benchmarkSource = "src/lib/hermit/knowledge/mirror-pang-dong-lai.md";
  const whitepaper = await readFile(path.join(root, whitepaperSource), "utf8");
  const benchmark = await readFile(path.join(root, benchmarkSource), "utf8");
  const inputs: InitialContent[] = [
    importSchema.parse({ id: "brand-whitepaper", type: "document", title: "精诚服务品牌升级：价值框架与路径",
      markdown: whitepaper, source: whitepaperSource, tags: ["白皮书", "官方理念"], visibility: "public" }),
    importSchema.parse({ id: "knowledge-mirror-pang-dong-lai", type: "document", title: "云游胖东来：标杆案例转译卡",
      markdown: benchmark, source: benchmarkSource, visibility: "public" }),
  ];
  for (const slug of INITIAL_CASE_SLUGS) {
    const item = FINAL_CANWU_ACTION_CASES.find(candidate => candidate.slug === slug);
    const source = item?.evidence.sourceMaterials.find(material => material.path)?.path;
    if (!item || !source) throw new Error(`Missing approved canonical case: ${slug}`);
    inputs.push(importSchema.parse({ id: `case-${slug}`, type: "case", title: item.metadata.title,
      markdown: await readFile(path.join(root, source), "utf8"), summary: item.brief.oneLine,
      tags: item.metadata.tags, source, businessScope: "汽车售后服务", visibility: "internal" }));
  }
  inputs.push(importSchema.parse(await bundledStandardizeSkill(root)), await bundledCaseInsightSkill(root));
  if (inputs.length !== 22 || new Set(inputs.map(input => input.id)).size !== 22) throw new Error("First-install inventory must contain exactly 22 unique resources");
  return inputs;
}

export function initialContentInventory(inputs: InitialContent[]) {
  return inputs.map(input => ({ id: input.id, type: input.type, title: input.title,
    visibility: input.visibility ?? (input.type === "case" ? "internal" : "public"),
    source: input.source, files: input.files.map(file => file.path) }));
}

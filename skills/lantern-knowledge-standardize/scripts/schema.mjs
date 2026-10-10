import { z } from "zod";

// Authoring protocol v1. Keep import compatibility covered by the repository test.
export const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/);
const date = z.iso.datetime({ offset: true }).nullable().default(null);
export const metadataSchema = z.object({
  schemaVersion: z.literal(1),
  id: identifier.optional(),
  type: z.enum(["notice", "case", "document", "skill", "tool"]),
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(1000),
  summary: z.string().trim().min(1).max(2000),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  businessScope: z.string().max(1000).default(""),
  changeNote: z.string().max(2000).default(""),
  validity: z.enum(["effective", "unknown", "expired"]).default("unknown"),
  visibility: z.enum(["public", "internal"]).optional(),
  effectiveFrom: date,
  effectiveTo: date,
  baseVersionId: identifier.optional(),
}).strict().refine(x => !x.effectiveFrom || !x.effectiveTo || Date.parse(x.effectiveFrom) < Date.parse(x.effectiveTo), {
  message: "effectiveFrom 必须早于 effectiveTo", path: ["effectiveTo"],
});

// Type-specific information stays in the body: the current Hub has no columns for it.
export const sections = {
  notice: ["适用对象", "具体要求", "生效说明"],
  case: ["背景", "行动", "结果", "复盘"],
  document: ["主题说明", "正文", "参考来源"],
  skill: ["用途", "适用条件", "输入", "输出", "操作步骤"],
  tool: ["用途", "访问方式", "使用条件", "操作说明"],
};

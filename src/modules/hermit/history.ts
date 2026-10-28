import { z } from "zod";
import type { UIMessage } from "ai";
import type { Principal } from "@/modules/auth/access";
import { AppError } from "@/shared/errors";
import { assertHermitPrincipal } from "./access";
import type { HermitConversationDocument, HermitConversationAttachment } from "@/lib/hermit/conversation-contract";

const attachment = z.object({ id: z.string().min(1).max(120), name: z.string().max(240), size: z.number().nonnegative() });
const document = z.object({ resourceId: z.string().min(1).max(120), versionId: z.string().min(1).max(120), title: z.string(), source: z.string() });
const citation = document.extend({ number: z.number().int().positive(), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() });
const recommendation = document.extend({ reason: z.string() });
const storedMetadata = z.object({
  hermitStatus: z.enum(["complete", "failed", "cancelled"]).optional(),
  status: z.enum(["complete", "failed", "cancelled"]).optional(),
  hermit: z.object({ version: z.literal(1), attachments: z.array(attachment).max(5), documentContext: document.nullable(),
    skillContext: document.nullable().optional(),
    answerSources: z.object({ status: z.literal("complete"), text: z.string(), citations: z.array(citation).max(20), recommendations: z.array(recommendation).max(6) }).optional(),
  }).optional(),
});

export type HermitTurnContext = { attachments: HermitConversationAttachment[]; documentContext: HermitConversationDocument | null; skillContext?: HermitConversationDocument | null };
export type HermitStoredMessage = { externalMessageId: string; role: string; content: string; metadataJson: unknown };

/** History is an employee account capability, never an opaque guest browser capability. */
export function assertHermitHistoryPrincipal(principal: Principal) {
  assertHermitPrincipal(principal, "hermit:chat");
  if (principal.kind === "guest") throw new AppError("forbidden", "登录员工账号后可保存和恢复历史对话。", 403);
}

export function readHistoryPage(search: URLSearchParams) {
  const limitValue = search.get("limit") ?? "20";
  if (!/^\d+$/.test(limitValue) || Number(limitValue) < 1 || Number(limitValue) > 50) throw new AppError("bad_request", "每页对话数量须为 1 至 50。", 400);
  const raw = search.get("cursor");
  let cursor: { id: string; updatedAt: Date } | null = null;
  if (raw !== null) {
    try {
      if (raw.length > 600) throw new Error("cursor length");
      const parsed = z.object({ id: z.string().min(1).max(160), updatedAt: z.string().datetime() }).strict().parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
      cursor = { id: parsed.id, updatedAt: new Date(parsed.updatedAt) };
    } catch { throw new AppError("bad_request", "历史对话分页标识无效。", 400); }
  }
  return { limit: Number(limitValue), cursor };
}

export function historyCursor(row: { id: string; updatedAt: Date }) {
  return Buffer.from(JSON.stringify({ id: row.id, updatedAt: row.updatedAt.toISOString() })).toString("base64url");
}

/** Only server-persisted assistant source envelopes are restored; arbitrary UI parts are never stored. */
export function restoreHistoryMessages(rows: HermitStoredMessage[]) {
  const messages: UIMessage[] = [];
  let context: HermitTurnContext = { attachments: [], documentContext: null };
  for (const row of rows) {
    const role = row.role.toLowerCase();
    if (role !== "user" && role !== "assistant") continue;
    const parsed = storedMetadata.safeParse(row.metadataJson);
    const metadata = parsed.success ? parsed.data : undefined;
    if (role === "assistant" && metadata?.hermit) context = { attachments: metadata.hermit.attachments, documentContext: metadata.hermit.documentContext,
      ...(metadata.hermit.skillContext !== undefined ? { skillContext: metadata.hermit.skillContext } : {}) };
    const parts: UIMessage["parts"] = row.content ? [{ type: "text", text: row.content }] : [];
    const status = role === "assistant" ? metadata?.hermitStatus ?? metadata?.status : undefined;
    const sources = role === "assistant" && status === "complete" ? metadata?.hermit?.answerSources : undefined;
    if (sources && sources.text === row.content) parts.push({ type: "data-answer-sources", data: sources });
    messages.push({ id: row.externalMessageId, role, parts, ...(status ? { metadata: { hermitStatus: status } } : {}) });
  }
  return { messages, context };
}

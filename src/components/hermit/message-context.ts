import type { UIMessage } from "ai";
import type { HermitConversationDocument, HermitMessageContext } from "@/lib/hermit/conversation-contract";

export type ContextRemoval = { kind: "attachment"; id: string } | { kind: "document" | "skill"; resourceId: string; versionId: string };

export function sameContextResource(a?: Pick<HermitConversationDocument, "resourceId" | "versionId"> | null, b?: Pick<HermitConversationDocument, "resourceId" | "versionId"> | null) {
  return !!a && !!b && a.resourceId === b.resourceId && a.versionId === b.versionId;
}

export function contextRequest(context: HermitMessageContext) {
  return {
    attachmentIds: context.attachments.map(item => item.id),
    ...(context.documentContext ? { documentContext: { resourceId: context.documentContext.resourceId, versionId: context.documentContext.versionId } } : {}),
    ...(context.skillContext ? { skillContext: { resourceId: context.skillContext.resourceId, versionId: context.skillContext.versionId } } : {}),
  };
}

/** Legacy retries may have used different materials than the original user turn. */
export function unrepresentedContext(active: HermitMessageContext, sent: HermitMessageContext | null): HermitMessageContext {
  const ids = new Set(sent?.attachments.map(item => item.id));
  return {
    attachments: active.attachments.filter(item => !ids.has(item.id)),
    documentContext: sameContextResource(active.documentContext, sent?.documentContext) ? null : active.documentContext,
    skillContext: sameContextResource(active.skillContext, sent?.skillContext) ? null : active.skillContext,
  };
}

/** Retry the sent turn, never the next draft; deliberate removals still take effect. */
export function retryContext(sent: HermitMessageContext, active: HermitMessageContext): HermitMessageContext {
  const ids = new Set(active.attachments.map(item => item.id));
  return {
    attachments: sent.attachments.filter(item => ids.has(item.id)),
    documentContext: sameContextResource(sent.documentContext, active.documentContext) ? sent.documentContext : null,
    skillContext: sameContextResource(sent.skillContext, active.skillContext) ? sent.skillContext : null,
  };
}

/** The UI only displays safe scalar fields. These do not authorize reads or model input. */
export function messageContext(message: UIMessage): HermitMessageContext | null {
  const metadata = message.metadata as { hermitContext?: HermitMessageContext } | undefined;
  const context = metadata?.hermitContext;
  if (message.role !== "user" || !context || !Array.isArray(context.attachments)) return null;
  const validDocument = (value: unknown): value is HermitConversationDocument => !!value && typeof value === "object"
    && ["resourceId", "versionId", "title", "source"].every(key => typeof (value as Record<string, unknown>)[key] === "string");
  return {
    attachments: context.attachments.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.size === "number" && Number.isFinite(item.size) && item.size >= 0),
    documentContext: validDocument(context.documentContext) ? context.documentContext : null,
    skillContext: validDocument(context.skillContext) ? context.skillContext : null,
  };
}

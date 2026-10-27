import type { UIMessage } from "ai";
import { getTextContent, type HermitAttachment, type HermitDocumentRecommendation } from "./types";

export interface ConversationSummary { id: string; title: string; preview: string; updatedAt: string }
export interface ConversationDetail {
  id: string; title: string; messages: UIMessage[];
  attachments: Array<{ id: string; name: string; size: number }>;
  unavailableAttachments: Array<{ id: string; name: string }>;
  documentContext: { resourceId: string; versionId: string; title: string; source: string } | null;
}
export type RunState = "complete" | "failed" | "cancelled";

export function markTerminalState(messages: UIMessage[], state: RunState): UIMessage[] {
  const last = messages[messages.length - 1];
  if (!last) return messages;
  if (last.role === "assistant") return [...messages.slice(0, -1), { ...last, metadata: { ...last.metadata as object, hermitStatus: state } }];
  return [...messages, { id: `${last.id}:status`, role: "assistant", parts: [], metadata: { hermitStatus: state } }];
}

export function restoredContext(detail?: ConversationDetail): HermitDocumentRecommendation | null {
  return detail?.documentContext ? { id: `context:${detail.documentContext.resourceId}`, ...detail.documentContext } : null;
}
export function restoredAttachments(detail?: ConversationDetail): HermitAttachment[] {
  const unavailable = new Set(detail?.unavailableAttachments.map(item => item.id));
  return (detail?.attachments ?? []).filter(item => !unavailable.has(item.id)).map(item => ({ ...item, localId: `restored:${item.id}`, status: "ready", sent: true }));
}
export function messageRunState(message?: UIMessage): RunState | null {
  const metadata = message?.metadata as { hermitStatus?: unknown } | undefined;
  return metadata?.hermitStatus === "failed" || metadata?.hermitStatus === "cancelled" || metadata?.hermitStatus === "complete" ? metadata.hermitStatus : null;
}
export function conversationTitle(messages: UIMessage[], fallback = "当前服务场景") {
  const text = getTextContent(messages.find(message => message.role === "user") ?? { id: "", role: "user", parts: [] }).trim();
  return text ? text.length > 34 ? `${text.slice(0, 34)}…` : text : fallback;
}

/** Identity and conversation changes invalidate reads even when fetch ignores abort. */
export class ConversationReadScope {
  private controller = new AbortController();
  private revision = 0;
  begin() {
    this.controller.abort();
    this.controller = new AbortController();
    const revision = ++this.revision;
    return { signal: this.controller.signal, current: () => revision === this.revision && !this.controller.signal.aborted };
  }
  dispose() { this.revision++; this.controller.abort(); }
}

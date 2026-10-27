import type { UIMessage } from "ai";

export type HermitTurnStatus = "complete" | "failed" | "cancelled";
export type HermitProgressStage = "connecting" | "searching" | "reading" | "answering";
export type HermitProgress = { stage: HermitProgressStage; label: string };
export type HermitConversationAttachment = { id: string; name: string; size: number };
export type HermitConversationDocument = { resourceId: string; versionId: string; title: string; source: string };
export type HermitConversationSummary = { id: string; title: string; preview: string; updatedAt: string };
export type HermitConversationList = { items: HermitConversationSummary[]; nextCursor: string | null };
export type HermitConversationDetail = {
  id: string;
  title: string;
  messages: UIMessage[];
  attachments: HermitConversationAttachment[];
  unavailableAttachments: Array<{ id: string; name: string }>;
  documentContext: HermitConversationDocument | null;
};

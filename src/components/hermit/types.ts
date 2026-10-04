import type { UIMessage } from "ai";

export type HermitAttachmentStatus = "uploading" | "ready" | "error";

export interface HermitAttachment {
  id?: string;
  localId: string;
  name: string;
  size: number;
  status: HermitAttachmentStatus;
  sent?: boolean;
  file?: File;
  error?: string;
}

export interface HermitDocumentRecommendation {
  id: string;
  resourceId: string;
  versionId: string;
  title: string;
  source: string;
  heading?: string;
}

export interface HermitDocumentContext {
  resourceId: string;
  versionId: string;
}

export interface HermitResourceVersion {
  id: string;
  markdown: string;
  citations?: Array<{
    id: string;
    heading?: string;
    startLine?: number;
    endLine?: number;
  }>;
}

export interface HermitResourceResponse {
  id: string;
  title: string;
  source: string;
  version: HermitResourceVersion;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const ACTIONABLE_ERROR_PATTERN = /文件|附件|文档|资源|知识|格式|扫描|ocr|pdf|docx|txt|markdown|过期|重传|unsupported|support|scanned|expired|upload/i;

export function getHermitApiError(value: unknown, fallback: string): string {
  const candidate = isRecord(value) && isRecord(value.error)
    ? value.error.message
    : isRecord(value) && typeof value.error === "string"
      ? value.error
      : isRecord(value) && typeof value.message === "string"
        ? value.message
        : typeof value === "string"
          ? value
          : "";
  const message = typeof candidate === "string" ? candidate.replace(/\s+/g, " ").trim() : "";
  if (!message || !ACTIONABLE_ERROR_PATTERN.test(message)) return fallback;
  return message.length > 140 ? `${message.slice(0, 140)}…` : message;
}

export function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function getDocumentRecommendations(message: UIMessage): HermitDocumentRecommendation[] {
  return message.parts.flatMap((part) => {
    if (!part.type.startsWith("data-") || part.type !== "data-document") return [];

    const candidate = (part as { id?: string; data?: unknown }).data;
    if (!isRecord(candidate)) return [];

    const resourceId = typeof candidate.resourceId === "string" ? candidate.resourceId.trim() : "";
    const versionId = typeof candidate.versionId === "string" ? candidate.versionId.trim() : "";
    const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
    const source = typeof candidate.source === "string" ? candidate.source.trim() : "";
    if (!resourceId || !versionId || !title || !source) return [];

    const partId = (part as { id?: unknown }).id;
    return [
      {
        id: typeof partId === "string" ? partId : `${resourceId}:${versionId}`,
        resourceId,
        versionId,
        title,
        source,
        heading: typeof candidate.heading === "string" && candidate.heading.trim() ? candidate.heading.trim() : undefined,
      },
    ];
  });
}

export function isHermitResourceResponse(value: unknown): value is HermitResourceResponse {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.source !== "string") {
    return false;
  }

  if (!isRecord(value.version) || typeof value.version.id !== "string" || typeof value.version.markdown !== "string") {
    return false;
  }

  return true;
}

export const HERMIT_SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;

export function isSupportedHermitFile(file: File): boolean {
  return HERMIT_SUPPORTED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension));
}

export function formatHermitFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

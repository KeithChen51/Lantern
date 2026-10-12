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
  reason?: string;
  startLine?: number;
  endLine?: number;
}

export interface HermitCitation {
  number: number;
  resourceId: string;
  versionId: string;
  title: string;
  source: string;
  startLine?: number;
  endLine?: number;
}

export interface HermitAnswerSources {
  status: "complete";
  text: string;
  citations: HermitCitation[];
  recommendations: HermitDocumentRecommendation[];
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

function getDataPartValue(part: unknown): unknown {
  return isRecord(part) ? part.data : undefined;
}

function readRequiredText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalLine(record: Record<string, unknown>, key: string): number | undefined | null {
  if (!(key in record) || record[key] === undefined || record[key] === null || record[key] === "") return undefined;
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return null;
  return value;
}

function parseCitation(value: unknown): HermitCitation | null {
  if (!isRecord(value) || typeof value.number !== "number" || !Number.isSafeInteger(value.number) || value.number < 1) return null;
  const resourceId = readRequiredText(value, "resourceId");
  const versionId = readRequiredText(value, "versionId");
  const title = readRequiredText(value, "title");
  const source = readRequiredText(value, "source");
  const startLine = readOptionalLine(value, "startLine");
  const endLine = readOptionalLine(value, "endLine");
  if (!resourceId || !versionId || !title || !source || startLine === null || endLine === null) return null;
  if (startLine !== undefined && endLine !== undefined && endLine < startLine) return null;
  return { number: value.number, resourceId, versionId, title, source, ...(startLine === undefined ? {} : { startLine }), ...(endLine === undefined ? {} : { endLine }) };
}

function parseRecommendation(value: unknown): HermitDocumentRecommendation | null {
  if (!isRecord(value)) return null;
  const resourceId = readRequiredText(value, "resourceId");
  const versionId = readRequiredText(value, "versionId");
  const title = readRequiredText(value, "title");
  const source = readRequiredText(value, "source");
  const reason = readRequiredText(value, "reason");
  const startLine = readOptionalLine(value, "startLine");
  const endLine = readOptionalLine(value, "endLine");
  if (!resourceId || !versionId || !title || !source || !reason || startLine === null || endLine === null) return null;
  if (startLine !== undefined && endLine !== undefined && endLine < startLine) return null;
  return {
    id: `recommendation:${resourceId}:${versionId}`,
    resourceId,
    versionId,
    title,
    source,
    reason,
    ...(startLine === undefined ? {} : { startLine }),
    ...(endLine === undefined ? {} : { endLine }),
  };
}

function parseAnswerSources(value: unknown): HermitAnswerSources | null {
  if (!isRecord(value) || value.status !== "complete" || typeof value.text !== "string") return null;
  const citations = Array.isArray(value.citations) ? value.citations.map(parseCitation).filter((item): item is HermitCitation => item !== null) : [];
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations.map(parseRecommendation).filter((item): item is HermitDocumentRecommendation => item !== null)
    : [];
  const uniqueCitations: HermitCitation[] = [];
  const citationNumbers = new Set<number>();
  for (const citation of citations) {
    if (citationNumbers.has(citation.number)) continue;
    citationNumbers.add(citation.number);
    uniqueCitations.push(citation);
  }
  const uniqueRecommendations: HermitDocumentRecommendation[] = [];
  const recommendationKeys = new Set<string>();
  for (const recommendation of recommendations) {
    const key = `${recommendation.resourceId}:${recommendation.versionId}`;
    if (recommendationKeys.has(key)) continue;
    recommendationKeys.add(key);
    uniqueRecommendations.push(recommendation);
  }
  return { status: "complete", text: value.text, citations: uniqueCitations, recommendations: uniqueRecommendations };
}

export function getAnswerSources(message: UIMessage): HermitAnswerSources | null {
  if (message.role !== "assistant") return null;
  const part = [...message.parts].reverse().find((candidate) => isRecord(candidate) && candidate.type === "data-answer-sources");
  return parseAnswerSources(getDataPartValue(part));
}

export function getTextContent(message: UIMessage): string {
  const answerSources = getAnswerSources(message);
  if (answerSources) return answerSources.text;
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function getDocumentRecommendations(message: UIMessage): HermitDocumentRecommendation[] {
  return getAnswerSources(message)?.recommendations ?? [];
}

export function getHermitCitations(message: UIMessage): HermitCitation[] {
  return getAnswerSources(message)?.citations ?? [];
}

export function getHermitCitationFromHref(href: unknown, citations: HermitCitation[]): HermitCitation | null {
  if (typeof href !== "string") return null;
  const match = href.match(/^#hermit-citation-(\d+)$/);
  if (!match) return null;
  const number = Number(match[1]);
  return citations.find((citation) => citation.number === number) ?? null;
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

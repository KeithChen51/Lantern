import { randomBytes, randomUUID } from "node:crypto";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { AppError } from "@/shared/errors";

/**
 * Hermit attachments are deliberately process-local for the first DSH slice.
 * They are never written to a public upload directory or to the knowledge hub.
 */
export const HERMIT_ATTACHMENT_OWNER_COOKIE = "lh_hermit_attachment_owner";
export const HERMIT_ATTACHMENT_TTL_MS = 30 * 60 * 1000;
export const HERMIT_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const HERMIT_ATTACHMENT_MAX_REQUEST_BYTES = 12 * 1024 * 1024;
export const HERMIT_ATTACHMENT_MAX_TEXT_CHARS = 200_000;
export const HERMIT_ATTACHMENT_MAX_FILES_PER_OWNER = 5;
export const HERMIT_ATTACHMENT_MAX_STORE_ENTRIES = 256;
export const HERMIT_ATTACHMENT_MAX_STORE_TEXT_CHARS = 4_000_000;
export const HERMIT_ATTACHMENT_MAX_RESOLVE_IDS = 5;
export const HERMIT_ATTACHMENT_PARSE_TIMEOUT_MS = 15_000;

export type HermitAttachmentStatus = "ready";

export type HermitAttachmentSummary = {
  id: string;
  name: string;
  size: number;
  status: HermitAttachmentStatus;
};

export type ResolvedHermitAttachment = {
  id: string;
  name: string;
  size: number;
  text: string;
};

type StoredHermitAttachment = ResolvedHermitAttachment & {
  ownerId: string;
  expiresAt: number;
};

const HERMIT_ATTACHMENT_STORE_KEY = Symbol.for("lantern.hermit.attachment-store");
const globalStore = globalThis as typeof globalThis & {
  [HERMIT_ATTACHMENT_STORE_KEY]?: Map<string, StoredHermitAttachment>;
};
const attachments = globalStore[HERMIT_ATTACHMENT_STORE_KEY] ?? new Map<string, StoredHermitAttachment>();
globalStore[HERMIT_ATTACHMENT_STORE_KEY] = attachments;

function getCookieValue(request: Request, cookieName: string) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== cookieName) continue;
    const value = part.slice(separator + 1).trim();
    return value || null;
  }

  return null;
}

function isValidOwnerId(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{32,64}$/.test(value));
}

function newOwnerId() {
  return randomBytes(32).toString("base64url");
}

export function readHermitAttachmentOwner(request: Request) {
  const cookieValue = getCookieValue(request, HERMIT_ATTACHMENT_OWNER_COOKIE);
  return isValidOwnerId(cookieValue) ? cookieValue : null;
}

export function createHermitAttachmentOwner() {
  return newOwnerId();
}

export function buildHermitAttachmentOwnerCookie(ownerId: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${HERMIT_ATTACHMENT_OWNER_COOKIE}=${ownerId}; Path=/; Max-Age=${Math.floor(
    HERMIT_ATTACHMENT_TTL_MS / 1000,
  )}; HttpOnly; SameSite=Lax${secure}`;
}

function purgeExpiredAttachments(now = Date.now()) {
  for (const [id, attachment] of attachments) {
    if (attachment.expiresAt <= now) attachments.delete(id);
  }
}

function countOwnerAttachments(ownerId: string) {
  let count = 0;
  for (const attachment of attachments.values()) {
    if (attachment.ownerId === ownerId) count += 1;
  }
  return count;
}

function countStoredTextChars() {
  let count = 0;
  for (const attachment of attachments.values()) count += attachment.text.length;
  return count;
}

function normalizedFileName(rawName: string) {
  const leafName = rawName.replaceAll("\\", "/").split("/").at(-1)?.trim() ?? "";
  const name = leafName.replaceAll("\u0000", "").slice(0, 240);
  if (!name) {
    throw new AppError("validation_error", "请选择一个有文件名的附件。", 422);
  }
  return name;
}

function normalizeText(text: string, emptyMessage: string) {
  const normalized = text
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  if (!normalized) {
    throw new AppError("validation_error", emptyMessage, 422);
  }
  if (normalized.length > HERMIT_ATTACHMENT_MAX_TEXT_CHARS) {
    throw new AppError(
      "validation_error",
      `附件解析后的文本不能超过 ${HERMIT_ATTACHMENT_MAX_TEXT_CHARS.toLocaleString()} 个字符。`,
      422,
    );
  }
  return normalized;
}

function fileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : "";
}

function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isZip(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

async function parsePdf(buffer: Buffer) {
  if (!isPdf(buffer)) {
    throw new AppError("validation_error", "这个文件不是有效的 PDF。", 422);
  }

  const parser = new PDFParse({ data: buffer, isEvalSupported: false });
  let destroyPromise: Promise<void> | undefined;
  const destroyParser = () => {
    destroyPromise ??= parser.destroy().catch(() => undefined);
    return destroyPromise;
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      parser.getText({ pageJoiner: "\n\n" }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          void destroyParser();
          reject(new AppError("validation_error", "PDF 解析超时，请上传较小或结构更简单的文件。", 422));
        }, HERMIT_ATTACHMENT_PARSE_TIMEOUT_MS);
        timeout.unref?.();
      }),
    ]);
    return normalizeText(result.text, "这个 PDF 没有可读取的文字；扫描版 PDF 暂不支持。请上传可复制文字的 PDF。");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("validation_error", "PDF 无法解析，请确认文件没有损坏或密码保护。", 422);
  } finally {
    if (timeout) clearTimeout(timeout);
    await destroyParser();
  }
}

async function parseDocx(buffer: Buffer) {
  if (!isZip(buffer)) {
    throw new AppError("validation_error", "这个文件不是有效的 Word .docx 文档。", 422);
  }

  try {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        mammoth.extractRawText({ buffer }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new AppError("validation_error", "Word 文档解析超时，请上传较小或结构更简单的文件。", 422)), HERMIT_ATTACHMENT_PARSE_TIMEOUT_MS);
          timeout.unref?.();
        }),
      ]);
      return normalizeText(result.value, "这个 Word 文档没有可读取的文字。请确认文档内容完整。");
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("validation_error", "Word 文档无法解析，请确认文件没有损坏。", 422);
  }
}

async function parseText(buffer: Buffer, extension: string) {
  if (buffer.includes(0)) {
    throw new AppError("validation_error", `${extension} 文件看起来不是纯文本，无法安全读取。`, 422);
  }
  return normalizeText(new TextDecoder("utf-8", { fatal: false }).decode(buffer), "这个文本文件没有可读取的内容。");
}

export async function parseHermitAttachment(file: File) {
  const name = normalizedFileName(file.name);
  const extension = fileExtension(name);

  if (file.size <= 0) {
    throw new AppError("validation_error", "附件不能为空。", 422);
  }
  if (file.size > HERMIT_ATTACHMENT_MAX_FILE_BYTES) {
    throw new AppError("validation_error", "单个附件不能超过 10MB。", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;

  switch (extension) {
    case ".pdf":
      text = await parsePdf(buffer);
      break;
    case ".docx":
      text = await parseDocx(buffer);
      break;
    case ".txt":
    case ".md":
    case ".markdown":
      text = await parseText(buffer, extension);
      break;
    case ".doc":
      throw new AppError(
        "validation_error",
        "传统 Word .doc 暂不支持。请先另存为 .docx 后再上传。",
        415,
      );
    default:
      throw new AppError("validation_error", "仅支持 PDF、Word .docx、TXT 或 Markdown 文件。", 415);
  }

  return { name, size: file.size, text };
}

function assertRequestBodySize(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;
  const parsed = Number(contentLength);
  if (Number.isFinite(parsed) && parsed > HERMIT_ATTACHMENT_MAX_REQUEST_BYTES) {
    throw new AppError("validation_error", "本次上传请求不能超过 12MB。", 413);
  }
}

export async function saveHermitAttachment(request: Request, file: File): Promise<{
  summary: HermitAttachmentSummary;
  ownerId: string;
  shouldSetOwnerCookie: boolean;
}> {
  assertRequestBodySize(request);
  purgeExpiredAttachments();

  const existingOwnerId = readHermitAttachmentOwner(request);
  const ownerId = existingOwnerId ?? createHermitAttachmentOwner();
  if (countOwnerAttachments(ownerId) >= HERMIT_ATTACHMENT_MAX_FILES_PER_OWNER) {
    throw new AppError("validation_error", "每个浏览器最多保留 5 个附件，请先移除旧附件。", 422);
  }
  if (attachments.size >= HERMIT_ATTACHMENT_MAX_STORE_ENTRIES) {
    throw new AppError("bad_request", "附件暂存空间已满，请稍后重试。", 503);
  }

  const parsed = await parseHermitAttachment(file);
  purgeExpiredAttachments();
  if (countOwnerAttachments(ownerId) >= HERMIT_ATTACHMENT_MAX_FILES_PER_OWNER) {
    throw new AppError("validation_error", "每个浏览器最多保留 5 个附件，请先移除旧附件。", 422);
  }
  if (attachments.size >= HERMIT_ATTACHMENT_MAX_STORE_ENTRIES) {
    throw new AppError("bad_request", "附件暂存空间已满，请稍后重试。", 503);
  }
  if (countStoredTextChars() + parsed.text.length > HERMIT_ATTACHMENT_MAX_STORE_TEXT_CHARS) {
    throw new AppError("bad_request", "附件暂存空间已满，请先移除其他附件后重试。", 503);
  }

  let id = randomUUID();
  while (attachments.has(id)) id = randomUUID();

  const summary: HermitAttachmentSummary = { id, name: parsed.name, size: parsed.size, status: "ready" };
  attachments.set(id, {
    id: summary.id,
    name: summary.name,
    size: summary.size,
    ownerId,
    text: parsed.text,
    expiresAt: Date.now() + HERMIT_ATTACHMENT_TTL_MS,
  });

  return { summary, ownerId, shouldSetOwnerCookie: !existingOwnerId };
}

export async function resolveHermitAttachments(
  request: Request,
  ids: string[],
): Promise<ResolvedHermitAttachment[]> {
  purgeExpiredAttachments();
  if (ids.length === 0) return [];
  if (ids.length > HERMIT_ATTACHMENT_MAX_RESOLVE_IDS) {
    throw new AppError("validation_error", "一次最多引用 5 个附件。", 422);
  }

  const normalizedIds = ids.map((id) => (typeof id === "string" ? id.trim() : ""));
  if (normalizedIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new AppError("validation_error", "附件标识无效。", 422);
  }
  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new AppError("validation_error", "附件标识不能重复。", 422);
  }

  const ownerId = readHermitAttachmentOwner(request);
  if (!ownerId) {
    throw new AppError("not_found", "附件不存在或已过期。", 404);
  }

  const resolved: ResolvedHermitAttachment[] = [];
  for (const id of normalizedIds) {
    const attachment = attachments.get(id);
    if (!attachment || attachment.ownerId !== ownerId) {
      throw new AppError("not_found", "附件不存在或已过期。", 404);
    }
    resolved.push({ id: attachment.id, name: attachment.name, size: attachment.size, text: attachment.text });
  }
  return resolved;
}

export async function deleteHermitAttachment(request: Request, id: string) {
  purgeExpiredAttachments();
  const ownerId = readHermitAttachmentOwner(request);
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!ownerId || !/^[0-9a-f-]{36}$/i.test(normalizedId)) {
    throw new AppError("not_found", "附件不存在或已过期。", 404);
  }

  const attachment = attachments.get(normalizedId);
  if (!attachment || attachment.ownerId !== ownerId) {
    throw new AppError("not_found", "附件不存在或已过期。", 404);
  }

  attachments.delete(normalizedId);
  return { id: normalizedId, deleted: true };
}

/** Test-only reset hook; the production store remains private to this module. */
export function resetHermitAttachmentStoreForTests() {
  attachments.clear();
}

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/shared/errors";
import type { ActionCaseCoverImage } from "@/modules/content";

const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;

const allowedMimeTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function getActionCaseUploadDir() {
  return process.env.ACTION_CASE_UPLOAD_DIR?.trim() || path.join(process.cwd(), "storage", "uploads", "action-cases");
}

function safeFileStem(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export async function saveActionCaseCoverImage(file: File, slug: string): Promise<ActionCaseCoverImage> {
  const extension = allowedMimeTypes[file.type];
  if (!extension) {
    throw new AppError("validation_error", "Cover image must be JPG, PNG, or WebP.", 422);
  }
  if (file.size <= 0 || file.size > MAX_COVER_IMAGE_BYTES) {
    throw new AppError("validation_error", "Cover image must be smaller than 5MB.", 422);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const checksum = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const fileName = `${safeFileStem(slug) || "action-case"}-${Date.now()}-${randomBytes(4).toString("hex")}-${checksum}.${extension}`;
  const uploadDir = getActionCaseUploadDir();
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), buffer);

  return {
    url: `/api/uploads/action-cases/${fileName}`,
    fileName,
    mimeType: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

export async function readActionCaseCoverImage(fileName: string) {
  if (fileName !== path.basename(fileName) || !/^[a-z0-9][a-z0-9-]*\.(jpg|png|webp)$/i.test(fileName)) {
    throw new AppError("not_found", "Cover image was not found.", 404);
  }
  const extension = path.extname(fileName).toLowerCase();
  const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  const buffer = await readFile(path.join(getActionCaseUploadDir(), fileName)).catch(() => null);
  if (!buffer) {
    throw new AppError("not_found", "Cover image was not found.", 404);
  }
  return { buffer, mimeType };
}

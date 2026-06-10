import { actionCaseService, type ActionCaseCoverImage, type SaveActionCaseDraftInput } from "@/modules/content";
import { saveActionCaseCoverImage } from "@/infrastructure/storage";
import { AppError } from "@/shared/errors";

const MAX_MARKDOWN_BYTES = 256 * 1024;

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTags(value: string) {
  return value
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseCoverImageJson(value: string): ActionCaseCoverImage | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ActionCaseCoverImage>;
    if (!parsed.url || !parsed.fileName || !parsed.mimeType || typeof parsed.size !== "number") return null;
    return {
      url: parsed.url,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      size: parsed.size,
      uploadedAt: parsed.uploadedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function readMarkdownFromFormData(formData: FormData) {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_MARKDOWN_BYTES) {
      throw new AppError("validation_error", "Markdown file must be smaller than 256KB.", 422);
    }
    if (!/\.(md|markdown)$/i.test(file.name)) {
      throw new AppError("validation_error", "Please upload a Markdown file.", 422);
    }
    return { markdown: await file.text(), fileName: file.name };
  }

  const markdown = readString(formData.get("markdown"));
  if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) {
    throw new AppError("validation_error", "Markdown content must be smaller than 256KB.", 422);
  }
  return { markdown, fileName: readString(formData.get("fileName")) || null };
}

export async function readDraftInputFromFormData(formData: FormData): Promise<SaveActionCaseDraftInput> {
  const slug = readString(formData.get("slug"));
  const coverFile = formData.get("coverImage");
  const existingCoverImage = parseCoverImageJson(readString(formData.get("coverImageJson")));
  const coverImage = coverFile instanceof File && coverFile.size > 0 ? await saveActionCaseCoverImage(coverFile, slug) : existingCoverImage;

  return {
    id: readString(formData.get("id")) || null,
    slug,
    title: readString(formData.get("title")),
    date: readString(formData.get("date")),
    tags: parseTags(readString(formData.get("tags"))),
    summary: readString(formData.get("summary")),
    markdown: readString(formData.get("markdown")),
    sourceFileName: readString(formData.get("sourceFileName")) || null,
    coverImage,
  };
}

export function parseMarkdown(markdown: string, fileName: string | null) {
  return actionCaseService.parseMarkdown(markdown, { fileName });
}

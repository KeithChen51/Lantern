import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/shared/errors";
import { MAX_PUBLICATION_UPLOAD_BYTES, type NewPublicationDraft, type PublicationImage } from "./contracts";

const MAX_STORED_BYTES = MAX_PUBLICATION_UPLOAD_BYTES * 2;
type StoredImage = Omit<PublicationImage, "bytes"> & { base64: string };
type StoredDraft = Omit<NewPublicationDraft, "cover" | "images"> & { cover: StoredImage; images: StoredImage[] };

function draftPath(id: string): string {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new AppError("not_found", "稿件不存在。", 404);
  const directory = process.env.WECOM_PUBLISHING_DATA_DIR?.trim() || path.join(process.cwd(), "storage", "uploads", "wecom-publications");
  return path.join(directory, `${id}.json`);
}

function storedImage(image: PublicationImage): StoredImage {
  return { name: image.name, mimeType: image.mimeType, base64: Buffer.from(image.bytes).toString("base64") };
}

/** The finalized immutable file exists before its database row becomes visible. */
export async function persistPublicationDraft(id: string, input: NewPublicationDraft): Promise<string> {
  const filename = draftPath(id);
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const stored: StoredDraft = { ...input, cover: storedImage(input.cover), images: input.images.map(storedImage) };
  const bytes = Buffer.from(JSON.stringify(stored), "utf8");
  if (bytes.length > MAX_STORED_BYTES) throw new AppError("validation_error", "稿件附件合计过大。", 422);
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filename);
  if (process.platform !== "win32") {
    const directory = await open(path.dirname(filename), "r");
    try { await directory.sync(); }
    finally { await directory.close(); }
  }
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readPublicationDraft(id: string, checksum: string): Promise<NewPublicationDraft> {
  const filename = draftPath(id);
  try {
    const metadata = await stat(filename);
    if (metadata.size > MAX_STORED_BYTES) throw new Error("invalid size");
    const bytes = await readFile(filename);
    if (createHash("sha256").update(bytes).digest("hex") !== checksum) throw new Error("checksum mismatch");
    const stored = JSON.parse(bytes.toString("utf8")) as StoredDraft;
    const image = (value: StoredImage): PublicationImage => ({ name: value.name, mimeType: value.mimeType, bytes: Buffer.from(value.base64, "base64") });
    return { ...stored, cover: image(stored.cover), images: stored.images.map(image) };
  } catch {
    throw new AppError("integration_error", "稿件文件暂时不可读取，请核对持久化存储。", 503);
  }
}

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readActionCaseCoverImage, saveActionCaseCoverImage } from "./action-case-images";

const originalUploadDir = process.env.ACTION_CASE_UPLOAD_DIR;
let tempDir: string | null = null;

async function useTempUploadDir() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "lantern-action-case-images-"));
  process.env.ACTION_CASE_UPLOAD_DIR = tempDir;
}

afterEach(async () => {
  process.env.ACTION_CASE_UPLOAD_DIR = originalUploadDir;
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("action case cover image storage", () => {
  it("stores an allowed cover image and reads it back", async () => {
    await useTempUploadDir();
    const file = new File([Buffer.from("fake image")], "cover.png", { type: "image/png" });

    const saved = await saveActionCaseCoverImage(file, "driver-partner-rest-area");
    const stored = await readActionCaseCoverImage(saved.fileName);

    expect(saved.url).toContain("/api/uploads/action-cases/");
    expect(saved.fileName).toMatch(/^driver-partner-rest-area-.+\.png$/);
    expect(stored.mimeType).toBe("image/png");
    expect(stored.buffer.toString()).toBe("fake image");
  });

  it("rejects unsupported image types and path traversal", async () => {
    await useTempUploadDir();
    await expect(saveActionCaseCoverImage(new File(["bad"], "cover.gif", { type: "image/gif" }), "case")).rejects.toThrow(
      /jpg, png, or webp/i,
    );
    await expect(readActionCaseCoverImage("../secret.png")).rejects.toThrow(/not found/i);
  });
});

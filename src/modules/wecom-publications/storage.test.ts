import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistPublicationDraft, readPublicationDraft } from "./storage";
import type { NewPublicationDraft } from "./contracts";

let directory: string;
const input: NewPublicationDraft = {
  article: { title: "测试刊物", digest: "摘要", html: "<p>正文</p>" }, originalHtml: "<!doctype html><p>正文</p>",
  cover: { name: "封面.png", mimeType: "image/png", bytes: new Uint8Array([137, 80, 78, 71, 1, 2]) },
  images: [{ name: "图片.jpg", mimeType: "image/jpeg", bytes: new Uint8Array([255, 216, 255, 2, 3]) }],
};

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "wecom-storage-"));
  vi.stubEnv("WECOM_PUBLISHING_DATA_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("immutable publication storage", () => {
  it("round-trips original HTML, normalized HTML, names and exact image bytes", async () => {
    const id = randomUUID();
    const checksum = await persistPublicationDraft(id, input);
    const loaded = await readPublicationDraft(id, checksum);
    expect(loaded.article).toEqual(input.article);
    expect(loaded.originalHtml).toBe(input.originalHtml);
    expect(loaded.cover.name).toBe("封面.png");
    expect([...loaded.cover.bytes]).toEqual([...input.cover.bytes]);
    expect([...loaded.images[0].bytes]).toEqual([...input.images[0].bytes]);
  });

  it("detects changed files and returns a safe storage error", async () => {
    const id = randomUUID();
    const checksum = await persistPublicationDraft(id, input);
    const filename = path.join(directory, `${id}.json`);
    await writeFile(filename, `${await readFile(filename, "utf8")} `);
    await expect(readPublicationDraft(id, checksum)).rejects.toMatchObject({ status: 503, message: "稿件文件暂时不可读取，请核对持久化存储。" });
  });

  it("rejects directory traversal before touching storage", async () => {
    await expect(readPublicationDraft("../outside", "checksum")).rejects.toMatchObject({ status: 404 });
    await expect(persistPublicationDraft("../outside", input)).rejects.toMatchObject({ status: 404 });
  });
});

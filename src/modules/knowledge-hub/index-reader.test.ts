import { describe, expect, it, vi } from "vitest";
import type { KnowledgeHub } from "./service";
import { createKnowledgeIndexReader, type KnowledgeIndexListing } from "./index-reader";

const now = "2026-10-12T00:00:00.000Z";
function resource(overrides: Record<string, unknown> = {}) {
  return {
    id: "policy", type: "document" as const, title: "服务指引", summary: "摘要", tags: ["服务"], source: "灯塔", businessScope: "售后", visibility: "public" as const, archived: false, publishedVersionId: "v1", createdAt: now, updatedAt: now, validity: "effective" as const, relations: [],
    version: { id: "v1", number: 1, title: "服务指引", markdown: "# 标题\n第一行\n第二行\n第三行", checksum: "sum", changeNote: "", createdAt: now, publishedAt: now, validity: "effective" as const, effectiveFrom: null, effectiveTo: null, files: [], citations: [{ id: "v1-L1", heading: "标题", startLine: 1, endLine: 4, text: "第一行\n第二行" }] },
    ...overrides,
  };
}

function hubFixture() {
  const value = resource();
  const get = vi.fn(async (id: string, versionId?: string) => {
    if (id !== value.id || versionId !== value.version.id) throw new Error("No published version available");
    return value;
  });
  const search = vi.fn(async (input: { query?: string; type?: string; offset?: number; limit?: number }) => ({
    items: [{ id: "policy", type: "document" as const, title: "服务指引", summary: "摘要".repeat(400), source: "灯塔", tags: ["服务"], visibility: "public" as const, versionId: "v1", version: 1, publishedAt: now, updatedAt: now, validity: "effective", score: 10, excerpt: "正文机密", citation: { id: "v1-L1", heading: "标题", startLine: 1, endLine: 4 } }].filter(item => !input.type || item.type === input.type),
    total: 1, offset: input.offset ?? 0, limit: input.limit ?? 20,
  }));
  return { value, get, search, hub: { get, search } as unknown as Pick<KnowledgeHub, "get" | "search"> };
}

describe("knowledge index reader", () => {
  it("searches and browses compact metadata without returning body excerpts", async () => {
    const { hub } = hubFixture();
    const reader = createKnowledgeIndexReader(hub);
    const result = await reader.search({ query: "服务", limit: 1 });
    expect(result.items[0]).toMatchObject({ id: "policy", title: "服务指引", versionId: "v1" });
    expect(result.items[0].summary).toHaveLength(600);
    expect(result.items[0]).not.toHaveProperty("excerpt");
    expect(result.items[0]).not.toHaveProperty("citation");
    const filtered = await reader.search({ query: "服务", tag: "服务", visibility: "public", limit: 1 });
    expect(filtered.total).toBe(1);
    const root = await reader.browse({});
    expect(root.mode).toBe("logical");
    expect(root.folders.map(folder => folder.name)).toContain("参悟案例");
    const documents = await reader.browse({ folderId: "logical:document" });
    expect(documents.resources[0]).toMatchObject({ id: "policy", path: "知识文档/服务指引" });
  });

  it("uses actual MySQL folder locations through the optional adapter", async () => {
    const { hub } = hubFixture();
    const listing: KnowledgeIndexListing = {
      folders: [{ id: "folder-a", name: "白皮书", parentId: null, deleted: false }, { id: "draft-folder", name: "待发布草稿", parentId: null, deleted: false }],
      resources: [{ id: "policy", name: "服务指引.md", folderId: "folder-a", type: "document", title: "服务指引", visibility: "public", archived: false, publishedVersionId: "v1", latestVersionId: "v1", updatedAt: now }],
    };
    const reader = createKnowledgeIndexReader(hub, async () => listing);
    const result = await reader.browse({ folderId: "folder-a" });
    expect(result).toMatchObject({ mode: "mysql", path: "白皮书" });
    expect(result.resources[0]).toMatchObject({ id: "policy", name: "服务指引.md", path: "白皮书/服务指引.md" });
    const root = await reader.browse({});
    expect(root.folders.map(folder => folder.name)).not.toContain("待发布草稿");
  });

  it("returns section metadata and bounded line or offset reads", async () => {
    const { hub, value, get } = hubFixture();
    const reader = createKnowledgeIndexReader(hub);
    const outline = await reader.outline({ resourceId: "policy", versionId: "v1" });
    expect(outline.sections[0]).toEqual({ id: "v1-L1", heading: "标题", startLine: 1, endLine: 4 });
    expect(outline).not.toHaveProperty("markdown");
    const lines = await reader.read({ resourceId: "policy", versionId: "v1", startLine: 2, lineCount: 2 });
    expect(lines).toMatchObject({ markdown: "第一行\n第二行", startLine: 2, endLine: 3, nextLine: 4, truncated: true });
    const long = resource({ version: { ...value.version, markdown: "x".repeat(20_000), citations: [] } });
    get.mockResolvedValueOnce(long as never);
    const offset = await reader.read({ resourceId: "policy", versionId: "v1", offset: 0 });
    expect(offset.markdown).toHaveLength(12_000);
    expect(offset.nextOffset).toBe(12_000);
    expect(offset.markdown.length).toBeLessThanOrEqual(12_000);
  });

  it("lists and reads only exact text files in a published Skill version", async () => {
    const { hub, get } = hubFixture();
    const skill = resource({ id: "skill", type: "skill", title: "标准化", source: "Skill", publishedVersionId: "s1", version: { id: "s1", number: 1, title: "标准化", markdown: "# 标准化", checksum: "sum", changeNote: "", createdAt: now, publishedAt: now, validity: "effective", effectiveFrom: null, effectiveTo: null, files: [
      { path: "SKILL.md", mediaType: "text/markdown", contentBase64: Buffer.from("# 说明\n" + "a".repeat(20_000)).toString("base64"), checksum: "md" },
      { path: "scripts/check.py", mediaType: "text/x-python", contentBase64: Buffer.from("print(1)").toString("base64"), checksum: "py" },
      { path: "assets/logo.bin", mediaType: "application/octet-stream", contentBase64: Buffer.from([0, 1, 2]).toString("base64"), checksum: "bin" },
    ], citations: [] } });
    get.mockImplementation(async () => skill as never);
    const reader = createKnowledgeIndexReader(hub);
    const files = await reader.skillFiles({ resourceId: "skill", versionId: "s1" });
    expect(files.files).toMatchObject([{ path: "SKILL.md", isText: true }, { path: "scripts/check.py", isText: true }, { path: "assets/logo.bin", isText: false }]);
    const content = await reader.skillRead({ resourceId: "skill", versionId: "s1", path: "SKILL.md" });
    expect(content.text).toHaveLength(12_000);
    expect(content.truncated).toBe(true);
    await expect(reader.skillRead({ resourceId: "skill", versionId: "s1", path: "assets/logo.bin" })).rejects.toThrow("文本文件");
    await expect(reader.skillRead({ resourceId: "skill", versionId: "s1", path: "../secret" })).rejects.toThrow();
  });

  it("delegates unpublished or unreadable versions to the published-only hub", async () => {
    const { hub, get } = hubFixture();
    const reader = createKnowledgeIndexReader(hub);
    await expect(reader.read({ resourceId: "policy", versionId: "draft" })).rejects.toThrow("No published version");
    expect(get).toHaveBeenCalledWith("policy", "draft");
  });
});

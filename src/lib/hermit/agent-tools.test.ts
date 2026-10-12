import { describe, expect, it, vi } from "vitest";
import { createHermitAgentTools } from "./agent-tools";

function fixture(attachmentText = "当前附件") {
  const resource = { id: "policy", type: "document" as const, title: "服务指引", summary: "", tags: [], source: "灯塔", businessScope: "", visibility: "public" as const, archived: false, publishedVersionId: "v1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: { id: "v1", number: 1, title: "服务指引", markdown: "正文", checksum: "sum", changeNote: "", createdAt: "2026-01-01T00:00:00.000Z", publishedAt: "2026-01-01T00:00:00.000Z", validity: "effective" as const, effectiveFrom: null, effectiveTo: null, files: [], citations: [] }, validity: "effective" as const, relations: [] };
  const hub = {
    get: vi.fn(async () => resource),
    search: vi.fn(async () => ({ query: "服务", items: [{ id: "policy", type: "document" as const, title: "服务指引", summary: "", source: "灯塔", tags: [], visibility: "public" as const, versionId: "v1", version: 1, publishedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", validity: "effective", score: 1, excerpt: "secret", citation: null }], total: 1, offset: 0, limit: 20 })),
  };
  const onDocument = vi.fn();
  const abort = new AbortController();
  const tools = createHermitAgentTools({ hub, browse: async () => ({ folders: [], resources: [] }), onDocument, signal: abort.signal, attachments: [{ id: "mine", name: "note.txt", size: attachmentText.length, text: attachmentText }] });
  return { tools, hub, onDocument, abort };
}

describe("Hermit request-scoped progressive knowledge tools", () => {
  it("returns index metadata without excerpts and exposes bounded read layers", async () => {
    const { tools, hub, onDocument } = fixture();
    const search = await tools.knowledge_search.execute({ query: "服务" });
    expect(search).toMatchObject({ query: "服务", items: [{ id: "policy", title: "服务指引" }] });
    expect(search).not.toHaveProperty("context");
    expect(search.items[0]).not.toHaveProperty("excerpt");
    await tools.knowledge_browse.execute({});
    await tools.knowledge_outline.execute({ resourceId: "policy", versionId: "v1" });
    await tools.knowledge_read.execute({ resourceId: "policy", versionId: "v1", startLine: 1, lineCount: 1 });
    expect(hub.search).toHaveBeenCalledWith({ query: "服务", type: undefined, offset: 0, limit: 20, sort: "relevance" });
    expect(onDocument).toHaveBeenCalledExactlyOnceWith({ resourceId: "policy", versionId: "v1", title: "服务指引", source: "灯塔" });
  });

  it("restricts attachment and Skill reads to request data and exact text paths", async () => {
    const { tools } = fixture();
    await expect(tools.attachment_read.execute({ id: "other" })).rejects.toThrow("不属于本次请求");
    await expect(tools.knowledge_file_read.execute({ resourceId: "skill", versionId: "v1", path: "../secret" })).rejects.toThrow();
    expect(await tools.attachment_read.execute({ id: "mine" })).toMatchObject({ text: "当前附件" });
    await expect(tools.knowledge_files.execute({ resourceId: "skill", versionId: "v1" })).rejects.toThrow("Skill");
    await expect(tools.knowledge_file_read.execute({ resourceId: "skill", versionId: "v1", path: "SKILL.md" })).rejects.toThrow("Skill");
  });

  it("stops before and after an aborted knowledge call", async () => {
    const { tools, hub, abort } = fixture();
    abort.abort();
    await expect(tools.knowledge_search.execute({ query: "new query" })).rejects.toThrow();
    expect(hub.search).not.toHaveBeenCalled();
  });

  it("counts failed calls toward the request tool budget", async () => {
    const { tools } = fixture();
    for (let index = 0; index < 20; index += 1) {
      await expect(tools.attachment_read.execute({ id: "other" })).rejects.toThrow("不属于本次请求");
    }
    await expect(tools.attachment_read.execute({ id: "mine" })).rejects.toThrow("调用次数已达上限");
  });

  it("caps aggregate returned characters for one request", async () => {
    const { tools } = fixture("x".repeat(12_000));
    for (let index = 0; index < 6; index += 1) await tools.attachment_read.execute({ id: "mine" });
    await expect(tools.attachment_read.execute({ id: "mine" })).rejects.toThrow("总量上限");
  });
});

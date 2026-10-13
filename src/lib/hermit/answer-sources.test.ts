import { describe, expect, it, vi } from "vitest";
import { createAnswerSources, stripSourceMarkers, type AnswerSourceRead } from "./answer-sources";
import { createHermitAgentTools, type HermitAgentTool } from "./agent-tools";
import { KnowledgeHub } from "@/modules/knowledge-hub/service";
import { MemoryHubStore } from "@/modules/knowledge-hub/test-store";

function resource(overrides: Record<string, unknown> = {}) {
  return {
    id: "guide",
    type: "document" as const,
    title: "服务指引",
    summary: "",
    tags: [],
    source: "灯塔知识中台",
    businessScope: "",
    visibility: "public" as const,
    archived: false,
    publishedVersionId: "v1",
    createdAt: "2026-10-12T00:00:00.000Z",
    updatedAt: "2026-10-12T00:00:00.000Z",
    validity: "effective" as const,
    relations: [],
    version: {
      id: "v1",
      number: 1,
      title: "服务指引",
      markdown: "# 服务指引\n第一行\n第二行\n第三行",
      checksum: "checksum",
      changeNote: "",
      createdAt: "2026-10-12T00:00:00.000Z",
      publishedAt: "2026-10-12T00:00:00.000Z",
      validity: "effective" as const,
      effectiveFrom: null,
      effectiveTo: null,
      files: [],
      citations: [],
    },
    ...overrides,
  };
}

function read(overrides: Partial<AnswerSourceRead> = {}): AnswerSourceRead {
  return {
    resourceId: "guide",
    versionId: "v1",
    title: "客户端标题不可信",
    source: "客户端来源不可信",
    startLine: 2,
    endLine: 3,
    text: "第一行\n第二行",
    ...overrides,
  };
}

describe("answer source evidence", () => {
  it.each([{ label: "absent", metadata: undefined }, { label: "null", metadata: null }])("cites a real published legacy version with $label metadata and honestly unknown source", async ({ metadata }) => {
    const store = new MemoryHubStore();
    const hub = new KnowledgeHub(store, () => "2026-10-13T00:00:00.000Z");
    const input = { id: "legacy-guide", type: "document", title: "原发布指引", source: "历史来源", markdown: "# 原发布指引\n第一行\n第二行\n结尾" };
    const legacy = await hub.import(input);
    await hub.publish(input.id, legacy.versionId);
    const draft = await hub.import({ ...input, title: "未发布标题", source: "UNPUBLISHED_SOURCE", markdown: "未发布草稿正文" });
    await store.transaction(async tx => {
      const stored = (await tx.getResource(input.id))!;
      stored.versions.find(version => version.id === legacy.versionId)!.metadata = metadata;
      await tx.saveResource(stored);
    });

    const sources = createAnswerSources({ hub });
    const tools: Record<string, HermitAgentTool> = createHermitAgentTools({ hub, attachments: [], signal: new AbortController().signal,
      onDocument: document => { sources.recordRead(document); }, additionalTools: sources.tools,
    });
    await expect(tools.knowledge_read.execute({ resourceId: input.id, versionId: legacy.versionId, startLine: 2, lineCount: 2 })).resolves.toMatchObject({
      resourceId: input.id, versionId: legacy.versionId, title: input.title, source: "", startLine: 2, endLine: 3, markdown: "第一行\n第二行",
    });
    expect(sources.snapshot("failed").reads).toMatchObject([{
      resourceId: input.id, versionId: legacy.versionId, title: input.title, source: "", startLine: 2, endLine: 3,
    }]);
    await expect(tools.knowledge_cite.execute({ resourceId: input.id, versionId: legacy.versionId, startLine: 2, endLine: 3 })).resolves.toEqual({ marker: "[[cite:1]]" });
    await expect(tools.knowledge_cite.execute({ resourceId: input.id, versionId: legacy.versionId, startLine: 1, endLine: 3 })).rejects.toThrow("可信范围");
    await tools.knowledge_recommend.execute({ resourceId: input.id, versionId: legacy.versionId, reason: "阅读已发布指引" });

    const finalized = await sources.finalize("依据已读行 [[cite:1]]");
    expect(finalized.citations).toEqual([{ number: 1, resourceId: input.id, versionId: legacy.versionId, title: input.title, source: "", startLine: 2, endLine: 3 }]);
    expect(finalized.recommendations).toEqual([{ resourceId: input.id, versionId: legacy.versionId, title: input.title, source: "", reason: "阅读已发布指引" }]);
    expect(finalized.text).toContain("[1](#hermit-citation-1)");
    expect(JSON.stringify(finalized)).not.toContain("UNPUBLISHED_SOURCE");
    await expect(tools.knowledge_read.execute({ resourceId: input.id, versionId: draft.versionId })).rejects.toThrow("No published");
    await expect(tools.knowledge_cite.execute({ resourceId: input.id, versionId: draft.versionId })).rejects.toThrow("尚未发布");
    expect(sources.snapshot("complete").reads).toHaveLength(1);
  });

  it("records only nonempty reads and requires an exact published server version", async () => {
    const get = vi.fn(async () => resource());
    const sources = createAnswerSources({ hub: { get } });

    expect(sources.recordRead(read({ text: "   " }))).toBe(false);
    expect(sources.recordRead(read())).toBe(true);
    expect(sources.snapshot("failed").reads).toHaveLength(1);
    await expect(sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1", startLine: 2, endLine: 2 })).resolves.toEqual({ marker: "[[cite:1]]" });

    get.mockResolvedValueOnce(resource({ version: { ...resource().version, id: "v2", publishedAt: null } }));
    const inaccessible = createAnswerSources({ hub: { get } });
    inaccessible.recordRead(read());
    await expect(inaccessible.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1" })).rejects.toThrow();
  });

  it("deduplicates citations, enforces trusted line bounds, and uses server metadata", async () => {
    const get = vi.fn(async () => resource());
    const sources = createAnswerSources({ hub: { get } });
    sources.recordRead(read());

    const first = await sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1", startLine: 2, endLine: 3 });
    const duplicate = await sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1", startLine: 2, endLine: 3 });
    expect(first).toEqual({ marker: "[[cite:1]]" });
    expect(duplicate).toEqual(first);
    await expect(sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1", startLine: 1, endLine: 3 })).rejects.toThrow("可信范围");

    const result = await sources.finalize("结论 [[cite:1]]，再次引用 [[cite:1]]。[[cite:99]]");
    expect(result.text).toBe("结论 [1](#hermit-citation-1)，再次引用 [1](#hermit-citation-1)。");
    expect(result.citations).toEqual([{
      number: 1,
      resourceId: "guide",
      versionId: "v1",
      title: "服务指引",
      source: "灯塔知识中台",
      startLine: 2,
      endLine: 3,
    }]);
  });

  it("searches every trusted read range for a citation", async () => {
    const get = vi.fn(async () => resource());
    const sources = createAnswerSources({ hub: { get } });
    sources.recordRead(read({ startLine: 2, endLine: 2, text: "第一行" }));
    sources.recordRead(read({ startLine: 4, endLine: 4, text: "第三行" }));

    await expect(sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1", startLine: 4, endLine: 4 })).resolves.toEqual({ marker: "[[cite:1]]" });
    const result = await sources.finalize("结论 [[cite:1]]");
    expect(result.citations[0]).toMatchObject({ startLine: 4, endLine: 4 });
  });

  it("does not cite package files, but can recommend read resources with a six item cap", async () => {
    const get = vi.fn(async (resourceId: string) => resource({ id: resourceId, title: resourceId, version: { ...resource().version, id: "v1" } }));
    const sources = createAnswerSources({ hub: { get } });
    sources.recordRead(read({ path: "scripts/check.ts", startLine: undefined, endLine: undefined, text: "console.log(1)" }));
    await expect(sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1" })).rejects.toThrow("Markdown");
    await expect(sources.tools.knowledge_recommend.execute({ resourceId: "guide", versionId: "v1", reason: "查看完整处理方法" })).resolves.toMatchObject({ accepted: true });
    await expect(sources.tools.knowledge_recommend.execute({ resourceId: "guide", versionId: "v1", reason: "重复推荐" })).resolves.toMatchObject({ accepted: true });

    for (let index = 1; index <= 5; index += 1) {
      const id = `doc-${index}`;
      sources.recordRead(read({ resourceId: id, title: id, source: "灯塔", text: "正文" }));
      await sources.tools.knowledge_recommend.execute({ resourceId: id, versionId: "v1", reason: `推荐 ${index}` });
    }
    sources.recordRead(read({ resourceId: "doc-6", text: "正文" }));
    await expect(sources.tools.knowledge_recommend.execute({ resourceId: "doc-6", versionId: "v1", reason: "超出上限" })).rejects.toThrow("6");
  });

  it("drops unused, invalid, code-contained and forged citation declarations", async () => {
    const get = vi.fn(async () => resource());
    const sources = createAnswerSources({ hub: { get } });
    sources.recordRead(read());
    await sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1", startLine: 2, endLine: 2 });
    await sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1", startLine: 3, endLine: 3 });

    const result = await sources.finalize("正文 [伪造](#hermit-citation-88) [[cite:1]]\n`[[cite:2]]` [[cite:404]]\n```md\n[[cite:1]]\n```");
    expect(result.text).toContain("正文 伪造 [1](#hermit-citation-1)");
    expect(result.text).toContain("`` ");
    expect(result.text).not.toContain("hermit-citation-88");
    expect(result.text).not.toContain("[[cite:");
    expect(result.citations.map(item => item.startLine)).toEqual([2]);
  });

  it.each(["    [[cite:1]]", "\\[[cite:1]]", "[read](https://example.com/[[cite:1]])", "[label [[cite:1]]](https://example.com)"])("does not count non-prose markers as citations: %s", async text => {
    const sources = createAnswerSources({ hub: { get: vi.fn(async () => resource()) } });
    sources.recordRead(read());
    await sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1" });
    const result = await sources.finalize(text);
    expect(result.citations).toEqual([]);
    expect(result.text).not.toContain("#hermit-citation-");
  });

  it("revokes citations and recommendations when the server version becomes inaccessible", async () => {
    let available = true;
    const get = vi.fn(async () => available ? resource() : (() => { throw new Error("revoked"); })());
    const sources = createAnswerSources({ hub: { get } });
    sources.recordRead(read());
    await sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1" });
    await sources.tools.knowledge_recommend.execute({ resourceId: "guide", versionId: "v1", reason: "继续阅读" });
    available = false;

    const result = await sources.finalize("依据 [[cite:1]]");
    expect(result.text).toBe("依据 ");
    expect(result.citations).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  it("keeps reads for failed or cancelled snapshots and only exposes finalized output on success", async () => {
    const sources = createAnswerSources({ hub: { get: vi.fn(async () => resource()) } });
    sources.recordRead(read());
    expect(sources.snapshot("failed")).toMatchObject({ mode: "progressive-index", status: "failed", citations: [], recommendations: [] });
    expect(sources.snapshot("cancelled")).toMatchObject({ mode: "progressive-index", status: "cancelled", citations: [], recommendations: [] });
    expect(sources.snapshot("failed").reads).toHaveLength(1);

    await sources.tools.knowledge_cite.execute({ resourceId: "guide", versionId: "v1", startLine: 2, endLine: 2 });
    await sources.finalize("依据 [[cite:1]]");
    expect(sources.snapshot("complete").citations).toHaveLength(1);
    expect(sources.snapshot("failed").citations).toEqual([]);
  });
});

describe("stripSourceMarkers", () => {
  it("removes complete and trailing partial markers without exposing protocol", () => {
    expect(stripSourceMarkers("a [[cite:1]] b [[cite:2")).toBe("a  b ");
    expect(stripSourceMarkers("a [")).toBe("a ");
    expect(stripSourceMarkers("a [[cite:")).toBe("a ");
    expect(stripSourceMarkers("`[[cite:1]]` [x](#hermit-citation-1)")).toBe("`` x");
  });

  it("keeps every streamed prefix monotonic across marker, ordinary-link, and forged-link splits", () => {
    const answer = "这是说明。[[cite:1]]，继续阅读 [普通链接](https://example.com)；[伪造](#hermit-citation-1)结束。";
    const outputs = Array.from({ length: answer.length + 1 }, (_, index) => stripSourceMarkers(answer.slice(0, index)));
    for (let index = 0; index + 1 < outputs.length; index += 1) {
      expect(outputs[index + 1].startsWith(outputs[index])).toBe(true);
      expect(outputs[index]).not.toMatch(/\[\[cite/);
    }
    expect(outputs.at(-1)).toBe("这是说明。，继续阅读 [普通链接](https://example.com)；伪造结束。");
  });
});

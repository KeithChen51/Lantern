import { describe, expect, it, vi } from "vitest";
import { createHermitAgentTools } from "./agent-tools";
import type { KnowledgeHub } from "@/modules/knowledge-hub/service";
import { emptySearchResult } from "./rag";

function fixture() {
  const resource = { id: "policy", title: "服务指引", source: "灯塔", validity: "effective", version: { id: "v1", markdown: "正文", citations: [] } };
  const get = vi.fn(async () => resource) as unknown as KnowledgeHub["get"];
  const search = vi.fn(async (query: string) => emptySearchResult(query));
  const onDocument = vi.fn();
  const abort = new AbortController();
  const tools = createHermitAgentTools({ hub: { get }, search, onDocument, signal: abort.signal,
    attachments: [{ id: "mine", name: "note.txt", size: 8, text: "当前附件" }] });
  return { tools, get, search, onDocument, abort };
}
describe("Hermit request-scoped agent tools", () => {
  it("rejects arbitrary filesystem access and attachments not in this request", async () => {
    const { tools } = fixture();
    await expect(tools.attachment_read.execute({ id: "other" })).rejects.toThrow("不属于本次请求");
    await expect(tools.attachment_read.execute({ id: "mine", path: "C:/secret" })).rejects.toThrow();
    expect(await tools.attachment_read.execute({ id: "mine" })).toMatchObject({ text: "当前附件" });
  });
  it("reads an explicit published resource version without a maintenance bypass", async () => {
    const { tools, get, onDocument } = fixture();
    await expect(tools.knowledge_read.execute({ resourceId: "policy", versionId: "v1", maintenance: true })).rejects.toThrow();
    await tools.knowledge_read.execute({ resourceId: "policy", versionId: "v1" });
    expect(get).toHaveBeenCalledExactlyOnceWith("policy", "v1");
    expect(onDocument).toHaveBeenCalledExactlyOnceWith({ resourceId: "policy", versionId: "v1", title: "服务指引", source: "灯塔" });
  });
  it("preserves insufficient-evidence retrieval and stops before another tool call on abort", async () => {
    const { tools, search, abort } = fixture();
    expect(await tools.knowledge_search.execute({ query: "unknown" })).toMatchObject({ decision: { status: "insufficient" } });
    expect(search).toHaveBeenCalledWith("unknown", 3);
    abort.abort();
    await expect(tools.knowledge_search.execute({ query: "new query" })).rejects.toThrow();
    expect(search).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: fetchMock }));
import { contextFromResource, readContextResources } from "./context-resources";

beforeEach(() => fetchMock.mockReset());
describe("Hermit context resource selection", () => {
  it("includes published document, case and notice searches without mixing skill/tools into document pagination", async () => {
    fetchMock.mockImplementation((url: string) => {
      const params = new URL(url, "http://localhost").searchParams;
      const type = params.get("type");
      return Promise.resolve(Response.json({ items: [{ id: type, versionId: "version", type, title: type, source: "灯塔", summary: "" }], total: type === "case" ? 30 : 13 }));
    });
    const signal = new AbortController().signal;
    const result = await readContextResources("knowledge", " 客户 ", 1, signal);
    expect(result.items.map(item => item.type)).toEqual(["document", "case", "notice"]);
    expect(result.hasMore).toBe(true);
    for (const [url, init] of fetchMock.mock.calls) {
      const params = new URL(url, "http://localhost").searchParams;
      expect(params.get("q")).toBe("客户"); expect(params.get("offset")).toBe("12");
      expect(init.signal).toBe(signal);
    }
  });
  it("requests only platform skills and preserves exact selected version independently of the title", async () => {
    const item = { id: "skill-id", versionId: "v2", title: "案例分析", source: "知识中台", type: "skill" as const, summary: "方法" };
    fetchMock.mockResolvedValue(Response.json({ items: [item], total: 1 }));
    expect((await readContextResources("skill", "", 0, new AbortController().signal)).hasMore).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("type=skill");
    expect(contextFromResource(item)).toEqual({ id: "context:skill-id:v2", resourceId: "skill-id", versionId: "v2", title: "案例分析", source: "知识中台" });
  });
  it("surfaces failed loads instead of presenting an empty successful library", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "知识服务不可用" }, { status: 500 }));
    await expect(readContextResources("skill", "", 0, new AbortController().signal)).rejects.toThrow("知识服务不可用");
  });
});

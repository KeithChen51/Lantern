import { describe, expect, it, vi } from "vitest";
import { searchHubForHermit } from "./hermit";
import { embedText } from "@/lib/hermit/rag";
const runtime = vi.hoisted(() => ({ search: vi.fn(async () => ({ items: [] })), get: vi.fn() }));
vi.mock("./runtime", () => ({ getKnowledgeHub: () => runtime }));
vi.mock("@/lib/hermit/rag", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/hermit/rag")>(), embedText: vi.fn() }));

describe("Hub RAG availability", () => {
  it("avoids embedding calls for blank input or no published candidate", async () => {
    expect((await searchHubForHermit(" ", 3)).decision.status).toBe("insufficient");
    expect(runtime.search).not.toHaveBeenCalled();
    expect((await searchHubForHermit("服务", 3)).chunks).toEqual([]);
    expect(embedText).not.toHaveBeenCalled();
  });
  it("propagates database failure so chat can report unavailable instead of fabricating context", async () => {
    runtime.search.mockRejectedValueOnce(new Error("offline"));
    await expect(searchHubForHermit("服务", 3)).rejects.toThrow("offline");
  });

  it("bounds cold embedding concurrency and preserves resource versions", async () => {
    runtime.search.mockResolvedValueOnce({ items: Array.from({ length: 3 }, (_, i) => ({ id: `resource-${i}`, versionId: `version-${i}`, type: "case", source: "test" })) } as never);
    runtime.get.mockImplementation(async (id: string) => ({ title: "道路救援员工保障", version: { citations: Array.from({ length: 3 }, (_, i) => ({ id: `${id}-${i}`, heading: "制度建议", text: `维修客户服务 ${id} ${i}`, startLine: 1, endLine: 2 })) } }));
    let active = 0; let peak = 0;
    vi.mocked(embedText).mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return [1, 0];
    });
    const result = await searchHubForHermit("汽车售后维修服务", 3);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(vi.mocked(embedText).mock.calls.some(([text]) => text.startsWith("道路救援员工保障 / 制度建议\n"))).toBe(true);
    expect(result.sourceSnapshot.sources.length).toBeGreaterThan(0);
    for (const source of result.sourceSnapshot.sources) {
      expect(source.resourceId).toMatch(/^resource-/);
      expect(source.versionId).toBe(source.resourceId?.replace("resource", "version"));
    }
  });
});

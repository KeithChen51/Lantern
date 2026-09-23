import { describe, expect, it, vi } from "vitest";
import { searchHubForHermit } from "./hermit";
import { embedText } from "@/lib/hermit/rag";
const runtime = vi.hoisted(() => ({ search: vi.fn(async () => ({ items: [] })) }));
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
});

import { describe, expect, it } from "vitest";
import { KnowledgeHub, buildCitations } from "./service";
import { MemoryHubStore } from "./test-store";

const input = { id: "whitepaper", type: "document", title: "服务白皮书", markdown: "# 服务\n\n求真尽善。", source: "官方白皮书" };
const received = { source: "agent-a", externalId: "conversation-1", scope: "excerpt", consent: { granted: true, at: "2026-09-23T08:00:00.000Z", purpose: "整理服务案例" }, messages: [{ id: "m1", role: "user", content: "这次客户等候时间过长" }, { id: "m2", role: "assistant", content: "可以先解释原因" }] };
function setup() {
  const store = new MemoryHubStore();
  let now = "2026-09-23T09:00:00.000Z";
  return { store, hub: new KnowledgeHub(store, () => now), time: (value: string) => { now = value; } };
}
describe("knowledge hub publication and retrieval", () => {
  it("imports once, isolates drafts, publishes, and retains exact old citations", async () => {
    const { hub } = setup();
    const v1 = await hub.import(input);
    const retry = await hub.import(input);
    expect(retry).toMatchObject({ duplicate: true, versionId: v1.versionId });
    expect((await hub.history(input.id))).toHaveLength(1);
    expect((await hub.search()).total).toBe(0);
    await expect(hub.get(input.id, v1.versionId)).rejects.toThrow("No published");
    await hub.publish(input.id, v1.versionId);
    const old = await hub.get(input.id);
    const v2 = await hub.import({ ...input, markdown: "# 服务\n\n新准则：主动告知等待时间。", baseVersionId: v1.versionId });
    expect((await hub.get(input.id)).version.id).toBe(v1.versionId);
    expect((await hub.search({ query: "新准则" })).total).toBe(0);
    await hub.publish(input.id, v2.versionId);
    expect((await hub.get(input.id)).version.id).toBe(v2.versionId);
    expect((await hub.get(input.id, v1.versionId)).version.citations).toEqual(old.version.citations);
    expect((await hub.search({ query: "等待时间" })).items[0].versionId).toBe(v2.versionId);
    await expect(hub.publish(input.id, v1.versionId)).rejects.toThrow("older version");
  });
  it("rejects stale updates and keeps metadata-only changes in audit", async () => {
    const { hub, store } = setup();
    const v1 = await hub.import(input);
    const renamed = await hub.import({ ...input, title: "新标题" });
    expect(renamed).toMatchObject({ duplicate: true, metadataChanged: true });
    expect(store.audits.at(-1)?.action).toBe("metadata_updated");
    await hub.import({ ...input, markdown: "# 第二版" });
    await expect(hub.import({ ...input, markdown: "冲突", baseVersionId: v1.versionId })).rejects.toThrow("Resource changed");
    expect(await hub.history(input.id)).toHaveLength(2);
  });
  it("serializes concurrent duplicate imports", async () => {
    const { hub } = setup();
    const results = await Promise.all([hub.import(input), hub.import(input), hub.import(input)]);
    expect(new Set(results.map(r => r.versionId)).size).toBe(1);
    expect(results.filter(r => !r.duplicate)).toHaveLength(1);
  });
  it("selects today's policy, then future policy without resurrecting expired predecessors", async () => {
    const { hub, time } = setup();
    const first = await hub.import({ ...input, type: "notice", validity: "effective" });
    await hub.publish(input.id, first.versionId);
    const next = await hub.import({ ...input, type: "notice", markdown: "新政策", validity: "effective", effectiveFrom: "2026-10-01T00:00:00.000Z", effectiveTo: "2026-11-01T00:00:00.000Z" });
    await hub.publish(input.id, next.versionId);
    expect((await hub.get(input.id)).version.id).toBe(first.versionId);
    time("2026-10-02T00:00:00.000Z");
    expect((await hub.get(input.id)).version.id).toBe(next.versionId);
    time("2026-11-02T00:00:00.000Z");
    expect((await hub.search()).total).toBe(0);
    expect((await hub.search({ includeInactive: true })).items[0].validity).toBe("expired");
    expect((await hub.get(input.id, first.versionId)).version.id).toBe(first.versionId);
  });
  it("archives resource without deleting history and hides relations to drafts", async () => {
    const { hub } = setup();
    const a = await hub.import(input), b = await hub.import({ ...input, id: "draft" });
    await hub.publish(input.id, a.versionId);
    await hub.relate({ fromVersionId: a.versionId, toVersionId: b.versionId, kind: "related" });
    expect((await hub.get(input.id)).relations).toEqual([]);
    await hub.archive(input.id);
    expect((await hub.search()).total).toBe(0);
    await expect(hub.get(input.id, a.versionId)).rejects.toThrow();
    expect(await hub.history(input.id)).toHaveLength(1);
    expect((await hub.get(input.id, a.versionId, true)).archived).toBe(true);
  });
  it("orders and paginates resources consistently, including natural Chinese queries", async () => {
    const { hub, time } = setup();
    for (const id of ["a", "b", "c"]) {
      time(`2026-09-2${id === "a" ? 3 : id === "b" ? 4 : 5}T00:00:00.000Z`);
      const result = await hub.import({ ...input, id, markdown: "客户等待的服务准则" });
      await hub.publish(id, result.versionId);
    }
    expect((await hub.search({ sort: "published", offset: 1, limit: 1 })).items.map(r => r.id)).toEqual(["b"]);
    expect((await hub.search({ query: "客户等待太久怎么办" })).total).toBe(3);
    await expect(hub.search({ limit: 1000 })).rejects.toThrow();
  });
  it("rejects unsafe package paths and includes attachments in version identity", async () => {
    const { hub } = setup();
    await expect(hub.import({ ...input, files: [{ path: "../secret", mediaType: "text/plain", contentBase64: "YQ==" }] })).rejects.toThrow();
    const a = await hub.import(input);
    const b = await hub.import({ ...input, files: [{ path: "examples/a.md", mediaType: "text/markdown", contentBase64: "YQ==" }] });
    expect(a.versionId).not.toBe(b.versionId);
    expect((await hub.get(input.id, b.versionId, true)).version.files[0].path).toBe("examples/a.md");
  });
  it("uses version-local citations, not mutable index ids", () => {
    const first = buildCitations("v1", "# 标题\n一\n## 子节\n二");
    expect(first.map(c => [c.id, c.startLine, c.endLine])).toEqual([["v1-L1", 1, 2], ["v1-L3", 3, 4]]);
    expect(buildCitations("v2", "# 标题\n一")[0].id).not.toBe(first[0].id);
  });
});
describe("interaction curation", () => {
  it("requires consent, deduplicates exact submissions and rejects changed retries", async () => {
    const { hub } = setup();
    await expect(hub.submitInteraction({ ...received, consent: { ...received.consent, granted: false } })).rejects.toThrow();
    const first = await hub.submitInteraction(received);
    expect(await hub.submitInteraction(received)).toEqual({ id: first.id, duplicate: true });
    await expect(hub.submitInteraction({ ...received, scope: "full" })).rejects.toThrow("different content");
    expect((await hub.search()).total).toBe(0);
  });
  it("curates selected messages as a separate draft before publication", async () => {
    const { hub, store } = setup();
    const interaction = await hub.submitInteraction(received);
    const draft = await hub.import({ ...input, type: "case", source: "交互沉淀", markdown: "# 等候案例\n经核实后的经验。" });
    await expect(hub.attachProvenance(draft.versionId, interaction.id, ["missing"])).rejects.toThrow();
    await hub.attachProvenance(draft.versionId, interaction.id, ["m1"]);
    expect(store.provenance[0].messageIds).toEqual(["m1"]);
    expect((await hub.get(input.id, draft.versionId, true)).provenance).toEqual([{ versionId: draft.versionId, interactionId: interaction.id, messageIds: ["m1"] }]);
    expect((await hub.search()).total).toBe(0);
    await hub.publish(input.id, draft.versionId);
    expect((await hub.search()).total).toBe(1);
    expect(JSON.stringify(await hub.get(input.id))).not.toContain("可以先解释原因");
    expect(await hub.get(input.id)).not.toHaveProperty("provenance");
    await expect(hub.attachProvenance(draft.versionId, interaction.id, ["m2"])).rejects.toThrow("unpublished");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KnowledgeHub } from "./service";
import { SqliteHubStore } from "./sqlite-store";

const builtin = (process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
const stores: SqliteHubStore[] = [];
const folders: string[] = [];
function open(path: string) {
  const store = new SqliteHubStore(path);
  stores.push(store);
  return store;
}
function filename() {
  const dir = mkdtempSync(join(tmpdir(), "lantern-sqlite-"));
  folders.push(dir);
  return join(dir, "knowledge.sqlite");
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const input = {
  id: "whitepaper",
  type: "document",
  title: "服务白皮书",
  markdown: "# 服务\n\n求真尽善",
  source: "官方白皮书",
};

describe.skipIf(!builtin?.call(process, "node:sqlite"))("SQLite knowledge persistence", () => {
  it("persists published resources across reopen, isolates drafts and retains old versions", async () => {
    const path = filename();
    const store = open(path);
    const hub = new KnowledgeHub(store);
    const first = await hub.import(input);
    expect((await hub.search()).total).toBe(0);
    await hub.publish(input.id, first.versionId);
    const second = await hub.import({ ...input, markdown: "# 服务\n\n主动沟通" });
    expect((await hub.get(input.id)).version.id).toBe(first.versionId);
    await hub.publish(input.id, second.versionId);
    const reopened = new KnowledgeHub(open(path));
    expect((await reopened.search({ query: "白皮书" })).total).toBe(1);
    expect((await reopened.get(input.id)).version.id).toBe(second.versionId);
    expect((await reopened.get(input.id, first.versionId)).version.markdown).toBe(input.markdown);
    expect(await reopened.import(input)).toMatchObject({ duplicate: true, versionId: first.versionId });
  });

  it("rolls back changes when a transaction fails, and the connection remains usable", async () => {
    const store = open(filename());
    const hub = new KnowledgeHub(store);
    await hub.import(input);
    await expect(store.transaction(async tx => {
      const resource = (await tx.getResource(input.id))!;
      resource.title = "must roll back";
      await tx.saveResource(resource);
      throw new Error("abort");
    })).rejects.toThrow("abort");
    expect(await store.transaction(tx => tx.getResource(input.id))).toMatchObject({ title: input.title });
  });

  it("serializes duplicate imports on separate connections without blocking their event loop", async () => {
    const path = filename();
    const a = new KnowledgeHub(open(path));
    const b = new KnowledgeHub(open(path));
    const results = await Promise.all([a.import(input), b.import(input), a.import(input)]);
    expect(new Set(results.map(result => result.versionId)).size).toBe(1);
    expect(await b.history(input.id)).toHaveLength(1);
  });

  it("preserves interaction consent, provenance and version relations across connections", async () => {
    const path = filename();
    const store = open(path);
    const hub = new KnowledgeHub(store);
    const first = await hub.import(input);
    const second = await hub.import({ ...input, id: "guide" });
    await store.transaction(async tx => {
      await tx.saveInteraction({
        id: "interaction",
        source: "agent",
        externalId: "session",
        checksum: "hash",
        scope: "excerpt",
        consentAt: "2026-09-23T00:00:00.000Z",
        purpose: "整理案例",
        messages: [{ id: "m1", role: "user", content: "已确认" }],
        resourceVersions: [],
        receivedAt: "2026-09-23T00:00:00.000Z",
      });
      await tx.saveProvenance({ versionId: first.versionId, interactionId: "interaction", messageIds: ["m1"] });
      await tx.saveRelation({ id: "relation", fromVersionId: first.versionId, toVersionId: second.versionId, kind: "related" });
    });
    await open(path).transaction(async tx => {
      expect(await tx.findInteraction("agent", "session")).toMatchObject({ purpose: "整理案例", scope: "excerpt" });
      expect(await tx.provenance(first.versionId)).toEqual([{ versionId: first.versionId, interactionId: "interaction", messageIds: ["m1"] }]);
      expect(await tx.relations(first.versionId)).toHaveLength(1);
    });
    expect((await hub.search()).total).toBe(0);
  });
});

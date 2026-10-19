import { describe, expect, it } from "vitest";
import { KnowledgeHub } from "./service";
import { MemoryHubStore } from "./test-store";
import { GuestHubStore } from "./guest-store";
import { createKnowledgeIndexReader } from "./index-reader";
import { createHermitAgentTools } from "@/lib/hermit/agent-tools";

async function fixture() {
  const store = new MemoryHubStore();
  const employee = new KnowledgeHub(store);
  const guest = new KnowledgeHub(new GuestHubStore(store));
  const publish = async (id: string, visibility: "public" | "internal", markdown = "已发布正文") => {
    const imported = await employee.import({ id, type: "document", title: id, source: "test", visibility, validity: "effective", markdown,
      files: [{ path: "note.txt", mediaType: "text/plain", contentBase64: Buffer.from(markdown).toString("base64") }] });
    await employee.publish(id, imported.versionId);
    return imported.versionId;
  };
  return { store, employee, guest, publish };
}

describe("Guest knowledge read boundary", () => {
  it("filters private metadata before pagination and denies guessed IDs and downloads", async () => {
    const { guest, employee, publish } = await fixture();
    const visible = await publish("public-guide", "public");
    const privateId = await publish("private-guide", "internal", "内部限定资料");
    const draft = await employee.import({ id: "draft", type: "document", title: "draft", source: "test", markdown: "未发布", visibility: "public" });
    const results = await guest.search({ limit: 1 });
    expect(results.total).toBe(1);
    expect(results.items[0].id).toBe("public-guide");
    expect((await guest.search({ query: "内部限定资料" })).total).toBe(0);
    expect((await guest.get("public-guide", visible)).version.files).toHaveLength(1);
    await expect(guest.get("private-guide", privateId)).rejects.toMatchObject({ code: "not_found" });
    await expect(guest.get("draft", draft.versionId)).rejects.toMatchObject({ code: "not_found" });
    expect((await employee.get("private-guide", privateId)).version.markdown).toBe("内部限定资料");
  });

  it("does not expose internal historical versions after a later public publication", async () => {
    const { guest, publish } = await fixture();
    const internal = await publish("guide", "internal", "内部历史");
    const current = await publish("guide", "public", "公开修订");
    await expect(guest.get("guide", internal)).rejects.toMatchObject({ code: "not_found" });
    expect((await guest.history("guide")).map(version => version.id)).toEqual([current]);
    expect((await guest.get("guide")).version.markdown).toBe("公开修订");
    await publish("guide", "internal", "重新限制访问");
    await expect(guest.get("guide", current)).rejects.toMatchObject({ code: "not_found" });
  });

  it("honors archiving and removes relationships pointing into internal resources", async () => {
    const { guest, employee, publish } = await fixture();
    const publicId = await publish("public", "public");
    const privateId = await publish("private", "internal");
    await employee.relate({ fromVersionId: publicId, toVersionId: privateId, kind: "related" });
    expect((await guest.get("public")).relations).toEqual([]);
    await employee.archive("public");
    expect((await guest.search()).total).toBe(0);
    await expect(guest.get("public", publicId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("denies legacy versions whose historical visibility snapshot is missing", async () => {
    const { store, guest, publish } = await fixture();
    const legacy = await publish("guide", "internal", "内部旧正文");
    await store.transaction(async tx => {
      const resource = (await tx.getResource("guide"))!;
      resource.versions.find(version => version.id === legacy)!.metadata = undefined;
      await tx.saveResource(resource);
    });
    const current = await publish("guide", "public", "公开新版");
    await expect(guest.get("guide", legacy)).rejects.toMatchObject({ code: "not_found" });
    expect((await guest.history("guide")).map(version => version.id)).toEqual([current]);
    expect((await guest.get("guide")).version.markdown).toBe("公开新版");
    await store.transaction(async tx => {
      const resource = (await tx.getResource("guide"))!;
      resource.versions.find(version => version.id === current)!.metadata = undefined;
      await tx.saveResource(resource);
    });
    expect((await guest.search()).total).toBe(0);
  });

  it("does not resurrect older public policy by removing an expired or internal effective version", async () => {
    const store = new MemoryHubStore();
    const clock = () => "2026-10-19T00:00:00.000Z";
    const employee = new KnowledgeHub(store, clock);
    const guest = new KnowledgeHub(new GuestHubStore(store, clock), clock);
    for (const validity of ["expired", "effective"] as const) {
      const id = `policy-${validity}`;
      const publish = async (visibility: "public" | "internal", state: "expired" | "effective", effectiveFrom?: string) => {
        const version = await employee.import({ id, type: "document", title: id, source: "test", visibility, validity: state, effectiveFrom, markdown: `${visibility} ${state} ${effectiveFrom ?? "today"}` });
        await employee.publish(id, version.versionId);
        return version.versionId;
      };
      const old = await publish("public", "effective");
      await publish("internal", validity);
      await publish("public", "effective", "2027-01-01T00:00:00.000Z");
      await expect(guest.get(id)).rejects.toMatchObject({ code: "not_found" });
      await expect(guest.get(id, old)).rejects.toMatchObject({ code: "not_found" });
      await expect(guest.history(id)).rejects.toMatchObject({ code: "not_found" });
      if (validity === "expired") await expect(employee.get(id)).rejects.toMatchObject({ code: "not_found" });
    }
    expect((await guest.search()).total).toBe(0);
  });

  it("applies the boundary to AI browse, outlines and package file reads", async () => {
    const { guest, publish } = await fixture();
    const visible = await publish("public", "public");
    const hidden = await publish("private", "internal");
    const tools = createHermitAgentTools({ hub: guest, browse: async () => ({ folders: [], resources: [
      { id: "public", name: "public", folderId: null, type: "document", title: "public", visibility: "public", archived: false, publishedVersionId: visible, latestVersionId: visible, updatedAt: "2026-10-19" },
      { id: "private", name: "private", folderId: null, type: "document", title: "private", visibility: "internal", archived: false, publishedVersionId: hidden, latestVersionId: hidden, updatedAt: "2026-10-19" },
    ] }), attachments: [], onDocument: () => undefined, signal: new AbortController().signal });
    const browse = await tools.knowledge_browse.execute({}) as { resources: { id: string }[] };
    expect(browse.resources.map(resource => resource.id)).toEqual(["public"]);
    await expect(tools.knowledge_read.execute({ resourceId: "private", versionId: hidden })).rejects.toMatchObject({ code: "not_found" });
    await expect(createKnowledgeIndexReader(guest).outline({ resourceId: "private", versionId: hidden })).rejects.toMatchObject({ code: "not_found" });
    await expect(guest.get("private", hidden, true)).rejects.toMatchObject({ code: "not_found" });
  });

  it("cannot use a guest store as a maintenance write or interaction reader", async () => {
    const { guest, store, publish } = await fixture();
    await publish("public", "public");
    await expect(guest.archive("public")).rejects.toMatchObject({ code: "invalid" });
    expect(store.resources.get("public")?.archived).toBe(false);
    await expect(new GuestHubStore(store).transaction(tx => tx.getInteraction("private-conversation"))).rejects.toMatchObject({ code: "invalid" });
  });
});

import { describe, expect, it, vi } from "vitest";
import { HermitDraftStore } from "./draft-store";
import { MIRROR_CASE_ID } from "./case-entry";
import { restoreCaseReference } from "./restore-case-reference";

const reference = { resourceId: MIRROR_CASE_ID, versionId: "published-v1" };
const publication = { id: MIRROR_CASE_ID, title: "服务器校验后的案例名称", source: "镜鉴", version: { id: reference.versionId, markdown: "不应写入浏览器存储的正文", publishedAt: "2026-10-28T00:00:00Z" } };
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("case intake reference across remounts", () => {
  it("restores accepted draft reference IDs and reads authorized publication metadata again", async () => {
    const memory = memoryStorage();
    const mounted = new HermitDraftStore("employee:a", memory);
    mounted.activate(); mounted.select("draft-one", false); mounted.write("draft-one", "请结合镜鉴案例分析我的现场");
    mounted.setCaseReference("draft-one", { ...reference, title: "旧名称", markdown: "私有正文", credentials: "private" } as typeof reference);
    mounted.dispose(); // The intake URL has already been consumed before this unmount.

    const remounted = new HermitDraftStore("employee:a", memory);
    remounted.activate();
    expect(remounted.text("draft-one")).toBe("请结合镜鉴案例分析我的现场");
    const signal = new AbortController().signal;
    const fetchResource = vi.fn().mockResolvedValue(Response.json(publication));
    const document = await restoreCaseReference(remounted.caseReference("draft-one")!, signal, fetchResource);
    expect(fetchResource).toHaveBeenCalledExactlyOnceWith(`/api/resources/${MIRROR_CASE_ID}?version=published-v1`, { signal });
    expect(document).toEqual({ id: `context:${MIRROR_CASE_ID}`, ...reference, title: publication.title, source: "镜鉴" });
    const snapshot = [...memory.values.values()][0];
    expect(snapshot).not.toMatch(/旧名称|私有正文|private|"markdown"|"title"|"source"/);

    remounted.select("other-conversation", true);
    expect(remounted.caseReference("other-conversation")).toBeNull();
    expect(new HermitDraftStore("employee:b", memory).caseReference("draft-one")).toBeNull();
    expect(new HermitDraftStore("guest:a", memory).caseReference("draft-one")).toBeNull();
  });

  it("clears removed and sent references across another reload", () => {
    const memory = memoryStorage();
    const store = new HermitDraftStore("employee:a", memory); store.activate();
    store.select("one", false); store.write("one", "草稿"); store.setCaseReference("one", reference);
    store.setCaseReference("one", null);
    expect(new HermitDraftStore("employee:a", memory).caseReference("one")).toBeNull();
    store.setCaseReference("one", reference); store.submitting("one", "已发送的问题");
    expect(new HermitDraftStore("employee:a", memory).caseReference("one")).toBeNull();
    expect(store.pendingText("one")).toBe("已发送的问题");
  });

  it("rejects modified or oversized storage hints without making an API request", async () => {
    const fetchResource = vi.fn();
    await expect(restoreCaseReference({ resourceId: "other-resource", versionId: "v1" }, new AbortController().signal, fetchResource)).rejects.toThrow("invalid-case-reference");
    const memory = memoryStorage();
    const store = new HermitDraftStore("employee:a", memory); store.activate(); store.select("one", false);
    store.setCaseReference("one", { resourceId: MIRROR_CASE_ID, versionId: "x".repeat(161) });
    expect(new HermitDraftStore("employee:a", memory).caseReference("one")).toBeNull();
    expect(fetchResource).not.toHaveBeenCalled();
  });
});

describe("case reference authorization and cancellation", () => {
  it.each([401, 403, 404, 503])("does not restore an unavailable or forbidden publication (%s)", async status => {
    const fetchResource = vi.fn().mockResolvedValue(Response.json({ error: "unavailable" }, { status }));
    await expect(restoreCaseReference(reference, new AbortController().signal, fetchResource)).rejects.toThrow("case-reference-unavailable");
  });

  it.each([
    { ...publication, id: "another" },
    { ...publication, version: { ...publication.version, id: "another-version" } },
    { ...publication, version: { ...publication.version, publishedAt: null } },
  ])("does not trust mismatched IDs or an unpublished response", async response => {
    await expect(restoreCaseReference(reference, new AbortController().signal, vi.fn().mockResolvedValue(Response.json(response)))).rejects.toThrow("case-reference-invalid-publication");
  });

  it("ignores a late successful body after its conversation unmounts or reference is removed", async () => {
    const controller = new AbortController();
    let release!: (value: unknown) => void;
    const body = new Promise(resolve => { release = resolve; });
    const fetchResource = vi.fn().mockResolvedValue({ ok: true, json: () => body });
    const restored = restoreCaseReference(reference, controller.signal, fetchResource);
    await Promise.resolve();
    controller.abort(); release(publication);
    await expect(restored).rejects.toMatchObject({ name: "AbortError" });
  });
});

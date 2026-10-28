import { describe, expect, it } from "vitest";
import { HermitDraftStore } from "./draft-store";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("Hermit tab-local drafts", () => {
  it("restores separate text drafts and current conversation after reload, and clears sent text", () => {
    const memory = storage();
    const first = new HermitDraftStore("employee:a", memory); first.activate();
    first.select("one", true); first.write("one", "第一段草稿");
    first.select("two", false); first.write("two", "第二段草稿");
    const restored = new HermitDraftStore("employee:a", memory); restored.activate();
    expect(restored.cursor).toEqual({ id: "two", persisted: false });
    expect(restored.text("one")).toBe("第一段草稿");
    expect(restored.text("two")).toBe("第二段草稿");
    restored.write("two", "");
    expect(new HermitDraftStore("employee:a", memory).text("two")).toBe("");
  });
  it("does not restore another identity's drafts and replaces them on identity change", () => {
    const memory = storage();
    const first = new HermitDraftStore("guest:a", memory); first.activate(); first.select("one", false); first.write("one", "私有草稿"); first.dispose();
    const other = new HermitDraftStore("employee:a", memory); expect(other.text("one")).toBe(""); other.activate();
    first.write("one", "迟到更新");
    expect(new HermitDraftStore("guest:a", memory).text("one")).toBe("");
  });
  it("expires old drafts and keeps working when storage is blocked", () => {
    const memory = storage();
    const first = new HermitDraftStore("employee:a", memory, () => 100); first.activate(); first.select("one", true); first.write("one", "过期草稿");
    expect(new HermitDraftStore("employee:a", memory, () => 100 + 24 * 60 * 60 * 1000).cursor).toBeNull();
    const blocked = new HermitDraftStore("employee:a", { getItem() { throw new Error(); }, setItem() { throw new Error(); } });
    blocked.activate(); blocked.write("one", "仍可编辑"); expect(blocked.text("one")).toBe("仍可编辑");
  });
  it("retains unacknowledged question text across a failed first send without replacing the next draft", () => {
    const memory = storage();
    const store = new HermitDraftStore("employee:a", memory); store.activate(); store.select("one", true);
    store.submitting("one", "第一次发送的问题"); store.write("one", "");
    expect(new HermitDraftStore("employee:a", memory).recoverText("one")).toBe("第一次发送的问题");
    store.write("one", "下一条草稿");
    expect(store.recoverText("one")).toBe("未确认发送的问题：\n第一次发送的问题\n\n未发送草稿：\n下一条草稿");
    store.acknowledged("one"); store.write("one", "");
    expect(new HermitDraftStore("employee:a", memory).recoverText("one")).toBe("");
  });
});

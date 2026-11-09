import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUGGESTION_LIMITS } from "@/modules/feedback/board-types";
import type { SuggestionDraft } from "./suggestion-draft";

const owner = "employee-1";
const draft: SuggestionDraft = { category: "knowledge", title: "  Useful title  ", content: "First line\nSecond line" };
const ttl = 24 * 60 * 60 * 1000;

function tabStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: vi.fn((key: string) => items.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { items.set(key, value); }),
    removeItem: vi.fn((key: string) => { items.delete(key); }),
  };
}

let storage: ReturnType<typeof tabStorage>;
beforeEach(() => {
  storage = tabStorage();
  vi.stubGlobal("window", { sessionStorage: storage });
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("suggestion drafts", () => {
  it("restores the category and exact text from memory and session storage", async () => {
    const store = await import("./suggestion-draft");
    store.writeSuggestionDraft(owner, draft);
    expect(store.readSuggestionDraft(owner)).toEqual(draft);

    vi.resetModules();
    const reopened = await import("./suggestion-draft");
    expect(reopened.readSuggestionDraft(owner)).toEqual(draft);
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("Storage unavailable"); } });
    expect(reopened.readSuggestionDraft(owner)).toEqual(draft);
  });

  it("isolates owners, including when a previous owner's draft is cleared late", async () => {
    const store = await import("./suggestion-draft");
    const otherOwner = "employee-2";
    const otherDraft = { ...draft, title: "A different title" };
    store.writeSuggestionDraft(owner, draft);
    expect(store.readSuggestionDraft(otherOwner)).toEqual(store.emptySuggestionDraft);

    store.writeSuggestionDraft(otherOwner, otherDraft);
    store.clearSuggestionDraft(owner);
    expect(store.readSuggestionDraft(owner)).toEqual(store.emptySuggestionDraft);

    vi.resetModules();
    const reopened = await import("./suggestion-draft");
    expect(reopened.readSuggestionDraft(owner)).toEqual(reopened.emptySuggestionDraft);
    expect(reopened.readSuggestionDraft(otherOwner)).toEqual(otherDraft);
  });

  it("bounds saved fields and omits extra fields", async () => {
    const store = await import("./suggestion-draft");
    const extraFields = {
      category: "invalid" as SuggestionDraft["category"],
      title: "x".repeat(SUGGESTION_LIMITS.title + 1),
      content: "x".repeat(SUGGESTION_LIMITS.content + 1),
      csrfToken: "secret",
    };
    store.writeSuggestionDraft(owner, extraFields);
    expect(store.readSuggestionDraft(owner)).toEqual({
      category: "platform",
      title: "x".repeat(SUGGESTION_LIMITS.title),
      content: "x".repeat(SUGGESTION_LIMITS.content),
    });
    expect([...storage.items.values()][0]).not.toContain("secret");
  });

  it("expires drafts at 24 hours in memory and in storage", async () => {
    const store = await import("./suggestion-draft");
    store.writeSuggestionDraft(owner, draft);
    store.writeSuggestionDraft("employee-2", draft);
    vi.advanceTimersByTime(ttl - 1);
    expect(store.readSuggestionDraft(owner)).toEqual(draft);
    vi.advanceTimersByTime(1);
    expect(store.readSuggestionDraft(owner)).toEqual(store.emptySuggestionDraft);

    vi.resetModules();
    const reopened = await import("./suggestion-draft");
    expect(reopened.readSuggestionDraft("employee-2")).toEqual(reopened.emptySuggestionDraft);
    expect(storage.items.size).toBe(0);
  });

  it.each([
    ["malformed JSON", () => "{"],
    ["wrong owner", () => JSON.stringify({ owner: "employee-2", updatedAt: Date.now(), draft })],
    ["invalid category", () => JSON.stringify({ owner, updatedAt: Date.now(), draft: { ...draft, category: "invalid" } })],
    ["oversized title", () => JSON.stringify({ owner, updatedAt: Date.now(), draft: { ...draft, title: "x".repeat(SUGGESTION_LIMITS.title + 1) } })],
  ])("discards a saved entry with %s", async (_label, invalidEntry) => {
    const store = await import("./suggestion-draft");
    store.writeSuggestionDraft(owner, draft);
    const [key] = storage.items.keys();
    storage.items.set(key, invalidEntry());

    vi.resetModules();
    const reopened = await import("./suggestion-draft");
    expect(reopened.readSuggestionDraft(owner)).toEqual(reopened.emptySuggestionDraft);
    expect(storage.items.has(key)).toBe(false);
  });

  it("keeps the latest draft in memory when storage is full", async () => {
    const store = await import("./suggestion-draft");
    store.writeSuggestionDraft(owner, draft);
    storage.setItem.mockImplementation(() => { throw new Error("Quota exceeded"); });
    const updatedDraft = { ...draft, content: "Latest edit" };

    store.writeSuggestionDraft(owner, updatedDraft);
    expect(store.readSuggestionDraft(owner)).toEqual(updatedDraft);
    store.clearSuggestionDraft(owner);
    expect(store.readSuggestionDraft(owner)).toEqual(store.emptySuggestionDraft);
  });

  it("handles unavailable storage and does not restore a cleared draft when storage returns", async () => {
    const store = await import("./suggestion-draft");
    store.writeSuggestionDraft(owner, draft);
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("Storage unavailable"); } });

    const otherOwner = "employee-2";
    expect(store.readSuggestionDraft(otherOwner)).toEqual(store.emptySuggestionDraft);
    store.writeSuggestionDraft(otherOwner, draft);
    expect(store.readSuggestionDraft(otherOwner)).toEqual(draft);
    store.clearSuggestionDraft(owner);
    expect(store.readSuggestionDraft(owner)).toEqual(store.emptySuggestionDraft);

    vi.stubGlobal("window", { sessionStorage: storage });
    expect(store.readSuggestionDraft(owner)).toEqual(store.emptySuggestionDraft);
    expect(storage.items.size).toBe(0);
  });
});

import { SUGGESTION_CATEGORIES, SUGGESTION_LIMITS, type SuggestionCategory } from "@/modules/feedback/board-types";

export type SuggestionDraft = { category: SuggestionCategory; title: string; content: string };
export const emptySuggestionDraft: Readonly<SuggestionDraft> = Object.freeze({ category: "platform", title: "", content: "" });

type SavedDraft = { owner: string; updatedAt: number; draft: SuggestionDraft };
const TTL = 24 * 60 * 60 * 1000;
const drafts = new Map<string, SavedDraft | null>();

function storageKey(owner: string) {
  return `lighthouse:feedback:suggestion-draft:v1:${owner}`;
}

function validCategory(category: unknown): category is SuggestionCategory {
  return SUGGESTION_CATEGORIES.some((option) => option.value === category);
}

function isCurrent(updatedAt: number) {
  const now = Date.now();
  return updatedAt <= now && now - updatedAt < TTL;
}

export function readSuggestionDraft(owner: string): SuggestionDraft {
  if (!owner || typeof window === "undefined") return { ...emptySuggestionDraft };

  const cached = drafts.get(owner);
  if (cached && isCurrent(cached.updatedAt)) return { ...cached.draft };
  if (cached !== undefined) {
    clearSuggestionDraft(owner);
    return { ...emptySuggestionDraft };
  }

  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(storageKey(owner));
  } catch {
    return { ...emptySuggestionDraft };
  }
  if (raw === null) return { ...emptySuggestionDraft };

  try {
    const saved = JSON.parse(raw) as Partial<SavedDraft> | null;
    const draft = saved?.draft;
    if (saved?.owner === owner && typeof saved.updatedAt === "number" && isCurrent(saved.updatedAt) &&
        draft && validCategory(draft.category) && typeof draft.title === "string" && draft.title.length <= SUGGESTION_LIMITS.title &&
        typeof draft.content === "string" && draft.content.length <= SUGGESTION_LIMITS.content) {
      const restored = { category: draft.category, title: draft.title, content: draft.content };
      drafts.set(owner, { owner, updatedAt: saved.updatedAt, draft: restored });
      return { ...restored };
    }
  } catch { /* Ignore malformed draft data. */ }
  clearSuggestionDraft(owner);
  return { ...emptySuggestionDraft };
}

export function writeSuggestionDraft(owner: string, draft: SuggestionDraft): void {
  if (!owner || typeof window === "undefined") return;

  const saved: SavedDraft = {
    owner,
    updatedAt: Date.now(),
    draft: {
      category: validCategory(draft.category) ? draft.category : emptySuggestionDraft.category,
      title: draft.title.slice(0, SUGGESTION_LIMITS.title),
      content: draft.content.slice(0, SUGGESTION_LIMITS.content),
    },
  };
  drafts.set(owner, saved);
  try {
    window.sessionStorage.setItem(storageKey(owner), JSON.stringify(saved));
  } catch { /* Keep the latest draft in memory when storage is unavailable or full. */ }
}

export function clearSuggestionDraft(owner: string): void {
  if (!owner || typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(storageKey(owner));
    drafts.delete(owner);
  } catch {
    // Remember the clear until storage returns so an earlier draft cannot reappear.
    drafts.set(owner, null);
  }
}

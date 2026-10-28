/** Tab-local text drafts only: never serialize messages, file contents or credentials. */
export interface DraftCursor { id: string; persisted: boolean }
interface Draft { text: string; updatedAt: number; pendingText?: string }
interface DraftSnapshot { version: 1; owner: string; cursor: DraftCursor | null; drafts: Record<string, Draft> }
type StorageLike = Pick<Storage, "getItem" | "setItem">;
const KEY = "lighthouse:hermit:drafts:v1";
const MAX_DRAFTS = 20;
const MAX_TEXT = 32_000;
const TTL = 24 * 60 * 60 * 1000;

function browserStorage(): StorageLike | undefined {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; }
}

export class HermitDraftStore {
  private snapshot: DraftSnapshot;
  private active = false;
  constructor(private owner: string | null, private storage = browserStorage(), private now = () => Date.now()) {
    this.snapshot = { version: 1, owner: owner ?? "", cursor: null, drafts: Object.create(null) };
    if (!owner) return;
    try {
      const value: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
      if (!value || typeof value !== "object") return;
      const saved = value as Partial<DraftSnapshot>;
      if (saved.version !== 1 || saved.owner !== owner) return;
      const drafts: Record<string, Draft> = Object.create(null);
      if (saved.drafts && typeof saved.drafts === "object") {
        for (const [id, draft] of Object.entries(saved.drafts).slice(-MAX_DRAFTS)) {
          if (id.length <= 160 && draft && typeof draft.text === "string" && draft.text.length <= MAX_TEXT &&
            typeof draft.updatedAt === "number" && draft.updatedAt <= now() && now() - draft.updatedAt < TTL) drafts[id] = {
              text: draft.text, updatedAt: draft.updatedAt,
              ...(typeof draft.pendingText === "string" && draft.pendingText.length <= MAX_TEXT ? { pendingText: draft.pendingText } : {}),
            };
        }
      }
      const cursor = saved.cursor;
      this.snapshot = { version: 1, owner, drafts, cursor: cursor && typeof cursor.id === "string" && cursor.id.length <= 160 &&
        typeof cursor.persisted === "boolean" && drafts[cursor.id] ? cursor : null };
    } catch { /* Storage may be disabled or contain an older/corrupt snapshot. */ }
  }
  get cursor() { return this.snapshot.cursor; }
  text(id: string) { return this.snapshot.drafts[id]?.text ?? ""; }
  pendingText(id: string) { return this.snapshot.drafts[id]?.pendingText; }
  recoverText(id: string) {
    const text = this.text(id), pending = this.pendingText(id);
    return pending && text && pending !== text ? `未确认发送的问题：\n${pending}\n\n未发送草稿：\n${text}` : text || pending || "";
  }
  activate() { this.active = true; this.save(); }
  dispose() { this.active = false; }
  select(id: string, persisted: boolean) {
    this.snapshot.cursor = { id, persisted };
    this.snapshot.drafts[id] ??= { text: "", updatedAt: this.now() };
    this.save();
  }
  write(id: string, text: string) {
    this.snapshot.drafts[id] = { ...this.snapshot.drafts[id], text: text.slice(0, MAX_TEXT), updatedAt: this.now() };
    this.save();
  }
  submitting(id: string, text: string) {
    this.snapshot.drafts[id] = { text: this.text(id), pendingText: text.slice(0, MAX_TEXT), updatedAt: this.now() };
    this.save();
  }
  acknowledged(id: string) {
    const draft = this.snapshot.drafts[id];
    if (draft) delete draft.pendingText;
    this.save();
  }
  private save() {
    if (!this.active || !this.owner) return;
    const entries = Object.entries(this.snapshot.drafts).filter(([, draft]) => this.now() - draft.updatedAt < TTL)
      .sort(([a, x], [b, y]) => a === this.snapshot.cursor?.id ? -1 : b === this.snapshot.cursor?.id ? 1 : y.updatedAt - x.updatedAt)
      .slice(0, MAX_DRAFTS);
    this.snapshot.drafts = Object.fromEntries(entries);
    try { this.storage?.setItem(KEY, JSON.stringify(this.snapshot)); } catch { /* Keep in-memory drafts when storage is unavailable/full. */ }
  }
}

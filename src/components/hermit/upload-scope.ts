/** One mounted identity owns every request in a queued attachment batch. */
export class HermitUploadScope {
  private readonly controller = new AbortController();

  constructor(readonly owner: string | null, private readonly currentOwner: () => string | null) {}

  get signal() { return this.controller.signal; }

  get active() {
    if (this.currentOwner() !== this.owner) this.dispose();
    return !this.signal.aborted;
  }

  assertActive() {
    if (!this.active) throw new DOMException("上传会话已结束。", "AbortError");
  }

  dispose() { this.controller.abort(); }

  async forEach<T>(items: readonly T[], action: (item: T) => Promise<void>) {
    for (const item of items) {
      this.assertActive();
      await action(item);
      // Even a fetch/parser that completes late after abort cannot start the
      // next upload under the replacement browser identity.
      this.assertActive();
    }
  }
}

export function hermitUploadOwner(session: { kind?: "employee" | "guest"; user: { id: string } } | null) {
  return session ? `${session.kind ?? "employee"}:${session.user.id}` : null;
}

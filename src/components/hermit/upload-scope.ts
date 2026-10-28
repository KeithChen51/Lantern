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

/** Release a cancelled file even if its parser or transport completes late. */
export function waitForHermitUpload<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(new DOMException("上传已取消。", "AbortError"));
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    // Keep observing work after cancellation: callers can safely clean up a
    // late successful upload without an unhandled rejection on late failure.
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

export function hermitUploadOwner(session: { kind?: "employee" | "guest"; user: { id: string } } | null) {
  return session ? `${session.kind ?? "employee"}:${session.user.id}` : null;
}

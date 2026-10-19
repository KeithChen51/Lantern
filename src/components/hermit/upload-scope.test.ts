import { describe, expect, it, vi } from "vitest";
import { HermitUploadScope, hermitUploadOwner } from "./upload-scope";

describe("Hermit attachment owner scope", () => {
  it("rejects replacement owners between files even if the original response completes late", async () => {
    let owner = "guest:guest:a";
    const scope = new HermitUploadScope(owner, () => owner);
    let finishFirst!: () => void;
    const post = vi.fn().mockImplementation(() => new Promise<void>(resolve => { finishFirst = resolve; }));
    const pending = scope.forEach(["first.txt", "second.txt"], async file => { await post(file, scope.signal); });
    expect(post).toHaveBeenCalledTimes(1);
    owner = "guest:guest:b";
    finishFirst();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(scope.signal.aborted).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    await expect(scope.forEach(["queued-retry"], post)).rejects.toMatchObject({ name: "AbortError" });
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("keeps employee and guest ownership distinct even for identical IDs", () => {
    expect(hermitUploadOwner({ kind: "guest", user: { id: "a" } })).not.toBe(hermitUploadOwner({ user: { id: "a" } }));
  });
});

import { describe, expect, it } from "vitest";
import { mergeUploadSelection, settleUploadBatch } from "./upload-queue";

describe("upload batch settlement", () => {
  const a = { id: "a", path: "A.md" };
  const b = { id: "b", path: "B.md" };
  const newerA = { id: "new-a", path: "A.md" };
  it("keeps files added after the batch started", () => {
    expect(settleUploadBatch([a, b], [a], [])).toEqual([b]);
    expect(settleUploadBatch([a, b], [a], [a])).toEqual([b, a]);
  });
  it("does not consume a replacement at the same path when the older upload completes", () => {
    const queue = mergeUploadSelection([a, b], [newerA]);
    expect(settleUploadBatch(queue, [a], [])).toEqual([b, newerA]);
    expect(settleUploadBatch(queue, [a], [a])).toEqual([b, newerA, a]);
  });
  it("settles only a retried subset and keeps other failed selections", () => {
    expect(settleUploadBatch([a, b, newerA], [a], [])).toEqual([b, newerA]);
    expect(settleUploadBatch([a, b], [a], [a])).toHaveLength(2);
  });
});

import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { FeedbackBoardService } from "./board-service";

const actor = { userId: "employee-1", canManage: false };

describe("suggestion service boundary", () => {
  it("rejects manager mutations before touching the database", async () => {
    const transaction = vi.fn();
    const service = new FeedbackBoardService({ $transaction: transaction } as unknown as PrismaClient);
    await expect(service.update(actor, "suggestion-1", {
      status: "accepted", category: "culture", note: "处理", relatedSuggestionId: null,
      expectedUpdatedAt: "2026-11-04T00:00:00.000Z",
    })).rejects.toMatchObject({ status: 403 });
    await expect(service.hideComment(actor, "suggestion-1", "comment-1")).rejects.toMatchObject({ status: 403 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("retries a rolled-back MySQL deadlock as one complete transaction", async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: "suggestion-1" }]), feedbackLike: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }), count: vi.fn().mockResolvedValue(1),
    } };
    const transaction = vi.fn().mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
      "deadlock", { code: "P2034", clientVersion: "6.19.3" },
    )).mockImplementation((callback) => callback(tx));
    const service = new FeedbackBoardService({ $transaction: transaction } as unknown as PrismaClient);
    await expect(service.setLike(actor, "suggestion-1", true)).resolves.toEqual({ liked: true, likeCount: 1 });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("returns a conflict after bounded deadlock retries", async () => {
    const transaction = vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "deadlock", { code: "P2034", clientVersion: "6.19.3" },
    ));
    const service = new FeedbackBoardService({ $transaction: transaction } as unknown as PrismaClient);
    await expect(service.setLike(actor, "suggestion-1", true)).rejects.toMatchObject({ status: 409 });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("does not retry unknown failures", async () => {
    const transaction = vi.fn().mockRejectedValue(new Error("offline"));
    const service = new FeedbackBoardService({ $transaction: transaction } as unknown as PrismaClient);
    await expect(service.setLike(actor, "suggestion-1", true)).rejects.toThrow("offline");
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("bounds notification batches without querying foreign IDs", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const service = new FeedbackBoardService({ feedbackNotification: { updateMany } } as unknown as PrismaClient);
    await service.markNotificationsRead(actor, []);
    expect(updateMany).not.toHaveBeenCalled();
    await expect(service.markNotificationsRead(actor, Array.from({ length: 101 }, (_, i) => `id-${i}`))).rejects.toMatchObject({ status: 400 });
    await service.markNotificationsRead(actor, ["foreign-id"]);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["foreign-id"] }, userId: actor.userId, readAt: null }, data: { readAt: expect.any(Date) },
    });
  });
});

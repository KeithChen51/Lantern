import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { FeedbackBoardService } from "./board-service";

const actor = { userId: "employee-1", canManage: false };

describe("suggestion service boundary", () => {
  it("returns bounded plain-text feed previews with sanitized responder names", async () => {
    const now = new Date("2026-11-04T00:00:00.000Z");
    const row = { id: "suggestion-1", title: "建议", category: "culture", status: "accepted",
      content: `  <script>literal</script>\n${"😀".repeat(200)}FULL_BODY_TAIL`, createdAt: now, updatedAt: now,
      author: { id: "author", displayName: "员工", employeeNo: null, identityAccounts: [] },
      _count: { likes: 2, comments: 1 }, likes: [], events: [{ note: `${"😀".repeat(200)}FULL_RESPONSE_TAIL`, createdAt: now,
        actor: { id: "admin", displayName: "secret-account", employeeNo: "secret-account", identityAccounts: [] } }] };
    const findMany = vi.fn().mockResolvedValue([row]);
    const service = new FeedbackBoardService({ feedbackSuggestion: { findMany, count: vi.fn().mockResolvedValue(1) },
      $transaction: (operations: Promise<unknown>[]) => Promise.all(operations) } as unknown as PrismaClient);
    const result = await service.list(actor, {});
    expect(Array.from(result.items[0].excerpt)).toHaveLength(180);
    expect(result.items[0].excerpt).toMatch(/^<script>literal<\/script> 😀/);
    expect(result.items[0].latestResponse).toMatchObject({ note: "😀".repeat(160), actor: { id: "admin", name: "姓名暂未获取" } });
    expect(JSON.stringify(result)).not.toMatch(/FULL_BODY_TAIL|FULL_RESPONSE_TAIL|secret-account|employeeNo|identityAccounts|"content"|"events"/);
    expect(findMany.mock.calls[0][0].include.events).toMatchObject({ take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  });

  it("ANDs participation and search using only the trusted actor", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const service = new FeedbackBoardService({ feedbackSuggestion: { findMany, count },
      $transaction: (operations: Promise<unknown>[]) => Promise.all(operations) } as unknown as PrismaClient);
    await service.list(actor, { participated: true, mine: true, category: "culture", status: "accepted", q: "topic" });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({ category: "culture", status: "accepted", authorId: actor.userId, AND: [
      { OR: [{ title: { contains: "topic" } }, { content: { contains: "topic" } }] },
      { OR: [{ authorId: actor.userId }, { likes: { some: { userId: actor.userId } } }, { comments: { some: { authorId: actor.userId } } }] },
    ] });
    expect(count).toHaveBeenCalledWith({ where });
  });

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

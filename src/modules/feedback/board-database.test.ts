import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { FeedbackBoardService } from "./board-service";
import type { BoardActor, SuggestionDetail, SuggestionUpdateInput } from "./board-types";

// Opt in only with a disposable, migrated MySQL database. Tests clean up solely their own UUID fixtures.
const databaseUrl = process.env.FEEDBACK_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("suggestion board on MySQL", () => {
  let db: PrismaClient;
  let service: FeedbackBoardService;
  const prefix = `feedback-test-${randomUUID()}`;
  const employee: BoardActor = { userId: `${prefix}-employee`, canManage: false };
  const coworker: BoardActor = { userId: `${prefix}-coworker`, canManage: false };
  const admin: BoardActor = { userId: `${prefix}-admin`, canManage: true };
  const users = [employee.userId, coworker.userId, admin.userId];
  const input = { category: "platform" as const, title: "让建议更清楚", content: "建议按使用场景组织。" };
  const update = (detail: SuggestionDetail, extra: Partial<SuggestionUpdateInput> = {}): SuggestionUpdateInput => ({
    status: "accepted", category: "culture", note: "已评估，安排落实。", relatedSuggestionId: null,
    expectedUpdatedAt: detail.updatedAt, ...extra,
  });

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: databaseUrl });
    service = new FeedbackBoardService(db);
    await db.user.createMany({ data: [
      { id: employee.userId, displayName: "员工甲", userType: "INTERNAL_EMPLOYEE" },
      { id: coworker.userId, displayName: `${prefix}-account`, userType: "INTERNAL_EMPLOYEE" },
      { id: admin.userId, displayName: "平台管理员", userType: "INTERNAL_EMPLOYEE" },
    ] });
    await db.identityAccount.create({ data: { userId: coworker.userId, provider: "lighthouse-portal", providerUserId: `${prefix}-account` } });
  });

  afterEach(async () => {
    if (db) await db.feedbackSuggestion.deleteMany({ where: { authorId: { in: users } } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.identityAccount.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });

  it("persists immediately visible suggestions and exposes only safe author names", async () => {
    const created = await service.create(employee, input);
    expect(created).toMatchObject({ ...input, status: "pending", author: { id: employee.userId, name: "员工甲" },
      comments: [], events: [], likeCount: 0, commentCount: 0, likedByMe: false });
    expect(await service.detail(coworker, created.id)).toEqual(created);
    const fallback = await service.create(coworker, input);
    expect(fallback.author).toEqual({ id: coworker.userId, name: "姓名暂未获取" });
    expect(JSON.stringify(fallback)).not.toContain(`${prefix}-account`);
    expect(await service.list(employee, { mine: true })).toMatchObject({ total: 1, items: [{ id: created.id }] });
  });

  it("combines filters, stable latest/popular sorting, and bounded pagination", async () => {
    await db.feedbackSuggestion.createMany({ data: Array.from({ length: 23 }, (_, index) => ({
      id: `${prefix}-suggestion-${String(index).padStart(2, "0")}`, authorId: employee.userId,
      title: `${prefix} 分页 ${index}`, content: "仅作测试", category: "platform",
      createdAt: new Date(1_800_000_000_000 + index), updatedAt: new Date(1_800_000_000_000 + index),
    })) });
    const first = await service.list(employee, { mine: true, category: "platform", status: "pending", q: prefix });
    const second = await service.list(employee, { mine: true, q: prefix, page: 2 });
    expect(first.total).toBe(23);
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(3);
    expect(first.items[0].id).toBe(`${prefix}-suggestion-22`);
    expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(23);
    await service.setLike(coworker, second.items[0].id, true);
    expect((await service.list(employee, { mine: true, sort: "popular", q: prefix })).items[0].id).toBe(second.items[0].id);
    expect((await service.list(coworker, { mine: true, q: prefix })).total).toBe(0);
  });

  it("enforces the unique like constraint and serializes concurrent idempotent set/unset", async () => {
    const created = await service.create(employee, input);
    await Promise.all(Array.from({ length: 12 }, () => service.setLike(employee, created.id, true)));
    expect(await db.feedbackLike.count({ where: { suggestionId: created.id } })).toBe(1);
    await expect(db.feedbackLike.create({ data: { suggestionId: created.id, userId: employee.userId } })).rejects.toMatchObject({ code: "P2002" });
    const added = await service.setLike(coworker, created.id, true);
    expect(added).toEqual({ liked: true, likeCount: 2 });
    await Promise.all(Array.from({ length: 12 }, () => service.setLike(employee, created.id, false)));
    expect(await service.setLike(employee, created.id, false)).toEqual({ liked: false, likeCount: 1 });
    expect((await service.detail(employee, created.id)).likedByMe).toBe(false);
    expect((await service.detail(coworker, created.id)).likedByMe).toBe(true);
  });

  it("keeps comment replies scoped and creates a notification only for another author", async () => {
    const created = await service.create(employee, input);
    const other = await service.create(coworker, input);
    const parent = await service.comment(employee, created.id, { content: "如何落地？" });
    const reply = await service.comment(coworker, created.id, { content: "安排一次讨论", replyToId: parent.id });
    expect(reply).toMatchObject({ replyToId: parent.id, replyToAuthorName: "员工甲", author: { name: "姓名暂未获取" } });
    await service.comment(employee, created.id, { content: "自己补充", replyToId: parent.id });
    await expect(service.comment(coworker, other.id, { content: "跨建议回复", replyToId: parent.id })).rejects.toMatchObject({ status: 400 });
    expect((await service.notifications(employee)).unreadCount).toBe(1);
    expect((await service.notifications(coworker)).unreadCount).toBe(0);
    expect((await service.detail(employee, created.id)).commentCount).toBe(3);
  });

  it("uses chronological stable comment pages and rejects a foreign suggestion cursor", async () => {
    const created = await service.create(employee, input);
    const other = await service.create(coworker, input);
    const sameTime = new Date("2026-11-04T00:00:00.000Z");
    await db.feedbackComment.createMany({ data: Array.from({ length: 53 }, (_, index) => ({
      id: `${prefix}-comment-${String(index).padStart(2, "0")}`, suggestionId: created.id,
      authorId: employee.userId, content: `评论 ${index}`, createdAt: sameTime,
    })) });
    const detail = await service.detail(employee, created.id);
    expect(detail.comments).toHaveLength(50);
    expect(detail.nextCommentCursor).toBeTruthy();
    const next = await service.comments(employee, created.id, detail.nextCommentCursor!);
    expect(next.items).toHaveLength(3);
    expect(next.nextCursor).toBeNull();
    expect(new Set([...detail.comments, ...next.items].map(({ id }) => id)).size).toBe(53);
    expect(next.items[0].content).toBe("评论 50");
    await expect(service.comments(employee, other.id, detail.nextCommentCursor!)).rejects.toMatchObject({ status: 400 });
  });

  it("writes a public status history and notifications atomically, allowing skipped states", async () => {
    const created = await service.create(employee, input);
    const related = await service.create(coworker, input);
    const changed = await service.update(admin, created.id, update(created, { status: "implemented", relatedSuggestionId: related.id }));
    expect(changed).toMatchObject({ status: "implemented", category: "culture", relatedSuggestion: { id: related.id },
      events: [{ fromStatus: "pending", toStatus: "implemented", actor: { id: admin.userId }, note: "已评估，安排落实。" }] });
    expect(Date.parse(changed.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
    expect((await service.notifications(employee)).items[0]).toMatchObject({ suggestionId: created.id, title: input.title, readAt: null });
    await service.update(admin, created.id, update(changed, { status: "implemented", category: "knowledge" }));
    expect((await service.notifications(employee)).unreadCount).toBe(1);
    expect((await service.detail(employee, created.id)).events).toHaveLength(2);
    const own = await service.create(admin, input);
    await service.update(admin, own.id, update(own));
    expect((await service.notifications(admin)).unreadCount).toBe(0);
  });

  it("rejects stale concurrent updates without duplicate history or notifications", async () => {
    const created = await service.create(employee, input);
    const results = await Promise.allSettled([
      service.update(admin, created.id, update(created, { status: "accepted" })),
      service.update(admin, created.id, update(created, { status: "declined" })),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect((await service.detail(employee, created.id)).events).toHaveLength(1);
    expect((await service.notifications(employee)).unreadCount).toBe(1);
  });

  it("advances optimistic versions even when the prior timestamp is ahead of the clock", async () => {
    const created = await service.create(employee, input);
    await db.feedbackSuggestion.update({ where: { id: created.id }, data: { updatedAt: new Date("2030-01-01T00:00:00.000Z") } });
    const future = await service.detail(employee, created.id);
    const first = await service.update(admin, created.id, update(future));
    const second = await service.update(admin, created.id, update(first, { status: "implemented" }));
    expect(Date.parse(first.updatedAt)).toBe(Date.parse(future.updatedAt) + 1);
    expect(Date.parse(second.updatedAt)).toBe(Date.parse(first.updatedAt) + 1);
    await expect(service.update(admin, created.id, update(first))).rejects.toMatchObject({ status: 409 });
  });

  it("validates internal related suggestions and manager permissions in the service", async () => {
    const created = await service.create(employee, input);
    await expect(service.update(employee, created.id, update(created))).rejects.toMatchObject({ status: 403 });
    await expect(service.update(admin, created.id, update(created, { relatedSuggestionId: created.id }))).rejects.toMatchObject({ status: 400 });
    await expect(service.update(admin, created.id, update(created, { relatedSuggestionId: "missing" }))).rejects.toMatchObject({ status: 400 });
    expect((await service.detail(employee, created.id)).events).toEqual([]);
  });

  it("rolls back both admin edits and reply comments when notification storage fails", async () => {
    const created = await service.create(employee, input);
    const parent = await service.comment(employee, created.id, { content: "原评论" });
    const failedClient = db.$extends({ query: { feedbackNotification: { create() { throw new Error("notification failed"); } } } });
    const failing = new FeedbackBoardService(failedClient as unknown as PrismaClient);
    await expect(failing.update(admin, created.id, update(created))).rejects.toThrow("notification failed");
    await expect(failing.comment(coworker, created.id, { content: "未提交的回复", replyToId: parent.id })).rejects.toThrow("notification failed");
    const detail = await service.detail(employee, created.id);
    expect(detail.status).toBe("pending");
    expect(detail.updatedAt).toBe(created.updatedAt);
    expect(detail.events).toEqual([]);
    expect(detail.comments).toHaveLength(1);
    expect((await service.notifications(employee)).unreadCount).toBe(0);
  });

  it("returns moderated comments as tombstones with no body leakage in any board response", async () => {
    const created = await service.create(employee, input);
    const comment = await service.comment(employee, created.id, { content: "需要移除的原始文本" });
    await service.comment(coworker, created.id, { content: "回复", replyToId: comment.id });
    await expect(service.hideComment(employee, created.id, comment.id)).rejects.toMatchObject({ status: 403 });
    await service.hideComment(admin, created.id, comment.id);
    await service.hideComment(admin, created.id, comment.id);
    const detail = await service.detail(employee, created.id);
    expect(detail.comments[0]).toMatchObject({ id: comment.id, content: "", hidden: true });
    expect(JSON.stringify(detail)).not.toContain("需要移除的原始文本");
    expect(JSON.stringify(await service.comments(employee, created.id))).not.toContain("需要移除的原始文本");
    expect(JSON.stringify(await service.notifications(employee))).not.toContain("需要移除的原始文本");
    await expect(service.comment(coworker, created.id, { content: "继续回复", replyToId: comment.id })).rejects.toMatchObject({ status: 400 });
  });

  it("scopes notification pages and read marks to the recipient", async () => {
    const created = await service.create(employee, input);
    const sameTime = new Date("2026-11-04T00:00:00.000Z");
    await db.feedbackNotification.createMany({ data: Array.from({ length: 53 }, (_, index) => ({
      id: `${prefix}-notification-${String(index).padStart(2, "0")}`, suggestionId: created.id,
      userId: employee.userId, message: `通知 ${index}`, createdAt: sameTime,
    })) });
    const first = await service.notifications(employee);
    expect(first.items).toHaveLength(50);
    expect(first.unreadCount).toBe(53);
    expect(first.nextCursor).toBeTruthy();
    const next = await service.notifications(employee, first.nextCursor!);
    expect(next.items).toHaveLength(3);
    expect(next.nextCursor).toBeNull();
    expect(new Set([...first.items, ...next.items].map(({ id }) => id)).size).toBe(53);
    await expect(service.notifications(coworker, first.nextCursor!)).rejects.toMatchObject({ status: 400 });
    await expect(service.markNotificationsRead(coworker, [first.items[0].id, "missing-id"])).resolves.toBeUndefined();
    expect((await service.notifications(employee)).unreadCount).toBe(53);
    await service.markNotificationsRead(employee, [first.items[0].id, "missing-id"]);
    await service.markNotificationsRead(employee, [first.items[0].id]);
    expect((await service.notifications(employee)).unreadCount).toBe(52);
    expect((await service.notifications(coworker)).items).toEqual([]);
  });

  it("returns not-found consistently for missing suggestions and mismatched comments", async () => {
    await expect(service.detail(employee, "missing-id")).rejects.toMatchObject({ status: 404 });
    await expect(service.setLike(employee, "missing-id", true)).rejects.toMatchObject({ status: 404 });
    const first = await service.create(employee, input);
    const second = await service.create(coworker, input);
    const comment = await service.comment(employee, first.id, { content: "评论" });
    await expect(service.hideComment(admin, second.id, comment.id)).rejects.toMatchObject({ status: 404 });
  });
});

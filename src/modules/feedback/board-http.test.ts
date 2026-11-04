import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/auth/access-types";
import { AppError } from "@/shared/errors";
const mocks = vi.hoisted(() => ({
  require: vi.fn(), revalidate: vi.fn(),
  service: Object.fromEntries(["list", "create", "detail", "setLike", "comment", "update", "hideComment", "comments", "notifications", "markNotificationsRead"].map(key => [key, vi.fn()])),
}));
vi.mock("./board-access", () => ({ requireFeedbackRequest: mocks.require, revalidateFeedbackWrite: mocks.revalidate, boardActor: (p: { userId: string; capabilities: string[] }) => ({ userId: p.userId, canManage: p.capabilities.includes("feedback:manage") }) }));
vi.mock("./board-service", () => ({ feedbackBoard: mocks.service }));
import { createSuggestion, createSuggestionComment, getSuggestion, hideSuggestionComment, listFeedbackNotifications, listSuggestionComments, listSuggestions, readFeedbackNotifications, setSuggestionLike, updateSuggestion } from "./board-http";
const actor = { userId: "employee-1", capabilities: [], grantId: "grant", credentialId: "session" };
const draft = { category: "culture", title: "改善交车沟通", content: "希望更清楚地说明后续安排。" };
function request(method = "GET", payload?: unknown, suffix = "") {
  return new Request(`https://app.invalid/api/feedback${suffix}`, { method, headers: { "content-type": "application/json", origin: "https://app.invalid", "x-csrf-token": "csrf" }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.require.mockResolvedValue(actor); mocks.revalidate.mockResolvedValue(actor); for (const method of Object.values(mocks.service)) method.mockResolvedValue({}); });
describe("suggestion API", () => {
  it.each([401, 403])("blocks every read and write before touching the database (%s)", async status => {
    mocks.require.mockRejectedValue(new AccessError("无权访问", status as 401 | 403));
    const responses = await Promise.all([
      listSuggestions(request()), createSuggestion(request("POST", draft)), getSuggestion(request(), "id"),
      updateSuggestion(request("PATCH", {}), "id"), setSuggestionLike(request("PUT", { liked: true }), "id"),
      listSuggestionComments(request(), "id"), createSuggestionComment(request("POST", { content: "支持" }), "id"),
      hideSuggestionComment(request("DELETE"), "id", "comment"), listFeedbackNotifications(request()), readFeedbackNotifications(request("PATCH", { ids: ["n1"] })),
    ]);
    for (const response of responses) { expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toContain("no-store"); }
    for (const method of Object.values(mocks.service)) expect(method).not.toHaveBeenCalled();
  });
  it("creates as the verified actor after revalidation, ignoring no client identity fields", async () => {
    const response = await createSuggestion(request("POST", draft));
    expect(response.status).toBe(201);
    expect(mocks.revalidate).toHaveBeenCalled();
    expect(mocks.service.create).toHaveBeenCalledWith({ userId: "employee-1", canManage: false }, draft);
    mocks.service.create.mockClear();
    const forged = await createSuggestion(request("POST", { ...draft, userId: "admin" }));
    expect(forged.status).toBe(400);
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it("does not write if the session expires while reading the body", async () => {
    mocks.revalidate.mockRejectedValue(new AccessError("会话已失效", 401));
    expect((await createSuggestion(request("POST", draft))).status).toBe(401);
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it("rejects a streamed body over the byte limit even without content-length", async () => {
    const response = await createSuggestion(request("POST", { ...draft, content: "文".repeat(6000) }));
    expect(response.status).toBe(400);
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it.each([null, [], { liked: "true" }, { liked: true, userId: "other" }])("rejects malformed or forged likes %j", async payload => {
    expect((await setSuggestionLike(request("PUT", payload), "id")).status).toBe(400);
    expect(mocks.service.setLike).not.toHaveBeenCalled();
  });
  it("sets the desired like state rather than toggling on retries", async () => {
    await setSuggestionLike(request("PUT", { liked: false }), "id");
    expect(mocks.service.setLike).toHaveBeenCalledWith({ userId: "employee-1", canManage: false }, "id", false);
  });
  it("requires fresh manager authority for status changes and comment moderation", async () => {
    const update = { category: "culture", status: "accepted", note: "纳入本月培训", relatedSuggestionId: null, expectedUpdatedAt: new Date().toISOString() };
    await updateSuggestion(request("PATCH", update), "id");
    expect(mocks.require).toHaveBeenLastCalledWith(expect.any(Request), { manage: true, write: true });
    expect(mocks.revalidate).toHaveBeenLastCalledWith(expect.any(Request), actor, true);
    await hideSuggestionComment(request("DELETE"), "id", "comment");
    expect(mocks.require).toHaveBeenLastCalledWith(expect.any(Request), { manage: true, write: true });
  });
  it("uses the logged-in recipient for notifications and rejects arbitrary query keys", async () => {
    await listFeedbackNotifications(request());
    expect(mocks.service.notifications).toHaveBeenCalledWith({ userId: "employee-1", canManage: false }, undefined);
    expect((await listFeedbackNotifications(request("GET", undefined, "?userId=other"))).status).toBe(400);
    await readFeedbackNotifications(request("PATCH", { ids: ["n1", "n1"] }));
    expect(mocks.service.markNotificationsRead).toHaveBeenCalledWith({ userId: "employee-1", canManage: false }, ["n1"]);
  });
  it("preserves explicit conflict errors while hiding database details", async () => {
    mocks.service.list.mockRejectedValue(new Error("mysql://private-password"));
    const unavailable = await listSuggestions(request());
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("private-password");
    mocks.service.detail.mockRejectedValue(new AppError("not_found", "建议不存在。", 404));
    expect((await getSuggestion(request(), "missing")).status).toBe(404);
  });
});

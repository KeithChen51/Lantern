import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/shared/errors";
import type { Principal } from "@/modules/auth/access-types";
import type { NewPublicationDraft } from "./contracts";

const auth = vi.hoisted(() => ({
  assertWebMutation: vi.fn(),
  requirePublicationAdmin: vi.fn(),
  requirePublicationClient: vi.fn(),
}));
const service = vi.hoisted(() => ({
  getPublicationTask: vi.fn(),
  listPublicationTasks: vi.fn(),
  loadPublicationDraft: vi.fn(),
  retryPublicationDelivery: vi.fn(),
  savePublicationDraft: vi.fn(),
  schedulePublication: vi.fn(),
}));
vi.mock("@/modules/auth/access", () => auth);
vi.mock("@/modules/auth/access-http", () => ({ json: (data: unknown, status = 200) => Response.json(data, { status }) }));
vi.mock("./service", () => service);
vi.mock("./configuration", () => ({
  publicationEnabled: () => true,
  getPublicationChannelInfo: () => [
    { id: "group", label: "集团企微", coverLimit: 2 ** 21, bodyImageLimit: 2 ** 21 },
    { id: "auto", label: "汽车企微", coverLimit: 10 * 2 ** 20, bodyImageLimit: 2 ** 21 },
  ],
}));

import { listPublicationTasksHttp, parseBeijingSchedule, schedulePublicationHttp } from "./http";

const admin: Principal = {
  userId: "admin-id", account: "admin-account", displayName: "Admin",
  channel: "web", grantId: "grant", credentialId: "session", csrfToken: "csrf",
  expiresAt: Date.now() + 60_000, capabilities: ["wecom:publish"],
};
const draft = (): NewPublicationDraft => ({
  article: { title: "测试", digest: "", html: "<p>图文</p>" },
  originalHtml: "<p>图文</p>", images: [],
  cover: { name: "cover.png", bytes: new Uint8Array(1024), mimeType: "image/png" },
});
const input = {
  draftId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  scheduledAt: "2099-11-26T09:00:00+08:00",
  targets: [
    { channel: "group", audience: { kind: "members", ids: ["member-a"] } },
    { channel: "auto", audience: { kind: "departments", ids: ["42"] } },
  ],
};
function request(value?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://lantern.example.invalid/api/admin/wecom-publications/tasks", {
    method: value ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    body: value ? JSON.stringify(value) : undefined,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.requirePublicationAdmin.mockResolvedValue(admin);
  auth.requirePublicationClient.mockResolvedValue({ ...admin, channel: "mcp" });
  service.loadPublicationDraft.mockResolvedValue(draft());
  service.schedulePublication.mockResolvedValue({ id: "scheduled-task" });
});

describe("WeCom publication routes", () => {
  it("denies reads and writes before touching publication data", async () => {
    auth.requirePublicationAdmin.mockRejectedValue(new AppError("forbidden", "仅平台管理员可发布。", 403));
    expect((await listPublicationTasksHttp(request())).status).toBe(403);
    expect(service.listPublicationTasks).not.toHaveBeenCalled();
    auth.requirePublicationClient.mockRejectedValue(new AppError("forbidden", "缺少发布授权。", 403));
    expect((await schedulePublicationHttp(request(input, { authorization: "Bearer read-token" }))).status).toBe(403);
    expect(service.loadPublicationDraft).not.toHaveBeenCalled();
  });

  it("uses explicit Beijing time and the authenticated actor for both entries", async () => {
    const cookieRequest = request(input);
    expect((await schedulePublicationHttp(cookieRequest)).status).toBe(201);
    expect(auth.assertWebMutation).toHaveBeenCalledWith(cookieRequest, admin);
    expect(service.schedulePublication).toHaveBeenCalledWith(
      { ...input, scheduledAt: new Date("2099-11-26T01:00:00.000Z") },
      { userId: admin.userId, account: admin.account, channel: "web" },
    );
    expect((await schedulePublicationHttp(request(input, { authorization: "Bearer publishing-token" }))).status).toBe(201);
    expect(service.schedulePublication).toHaveBeenLastCalledWith(expect.any(Object), expect.objectContaining({ channel: "mcp" }));
    expect(auth.assertWebMutation).toHaveBeenCalledTimes(1);
  });

  it("rejects an all alias in the member selector and applies the lower cover limit", async () => {
    const withImplicitAll = { ...input, targets: [{ channel: "group", audience: { kind: "members", ids: ["@all"] } }] };
    expect((await schedulePublicationHttp(request(withImplicitAll))).status).toBe(422);
    const groupDraft = draft();
    groupDraft.cover.bytes = new Uint8Array(2 ** 21 + 1);
    service.loadPublicationDraft.mockResolvedValue(groupDraft);
    expect((await schedulePublicationHttp(request(input))).status).toBe(422);
    expect(service.schedulePublication).not.toHaveBeenCalled();
  });

  it("rejects an impossible calendar date and a missing time zone", () => {
    expect(() => parseBeijingSchedule("2099-02-31T10:00+08:00")).toThrow();
    expect(() => parseBeijingSchedule("2099-11-26T09:00")).toThrow();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: true, visitor: vi.fn(), list: vi.fn(), get: vi.fn(), resolve: vi.fn(), document: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireSiteVisitor: mocks.visitor, authErrorResponse: (error: { status?: number; message?: string }) => Response.json({ error: { message: error.message } }, { status: error.status ?? 503 }) }));
vi.mock("./repository", () => ({ hermitChatRepository: { listConversations: mocks.list, getConversation: mocks.get } }));
vi.mock("@/lib/hermit/attachments", () => ({ resolveHermitAttachments: mocks.resolve }));
vi.mock("@/modules/knowledge-hub/runtime", () => ({ isKnowledgeHubEnabled: () => mocks.enabled, getSiteKnowledgeHub: () => ({ get: mocks.document }) }));
import { listHermitConversations, getHermitConversation } from "./history-api";
import { AppError } from "@/shared/errors";
const principal = { kind: "employee", userId: "employee-a", channel: "web", grantId: "grant", credentialId: "web", capabilities: ["hermit:chat", "hermit:attachment:self"], expiresAt: Date.now() + 3600000 };
beforeEach(() => {
  mocks.enabled = true;
  vi.resetAllMocks(); mocks.visitor.mockResolvedValue(principal); mocks.list.mockResolvedValue({ items: [], nextCursor: null });
});
describe("employee account history API", () => {
  it("uses the authenticated account and rejects guest/tool/expired/unauthenticated reads before storage", async () => {
    const request = new Request("http://localhost/api/hermit/conversations?userId=other&limit=10");
    const response = await listHermitConversations(request);
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith("employee-a", { limit: 10, cursor: null });
    for (const invalid of [{ ...principal, kind: "guest" }, { ...principal, channel: "cli" }, { ...principal, expiresAt: 1 }, { ...principal, capabilities: [] }]) {
      mocks.visitor.mockResolvedValue(invalid);
      expect([401, 403]).toContain((await listHermitConversations(request)).status);
      expect([401, 403]).toContain((await getHermitConversation(request, "private" )).status);
    }
    expect(mocks.list).toHaveBeenCalledTimes(1); expect(mocks.get).not.toHaveBeenCalled();
    mocks.visitor.mockRejectedValue(new AppError("unauthorized", "login", 401));
    expect((await listHermitConversations(request)).status).toBe(401);
  });

  it("rejects unbounded pagination and isolates foreign conversation errors", async () => {
    expect((await listHermitConversations(new Request("http://localhost/api/hermit/conversations?limit=999"))).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
    mocks.get.mockRejectedValue(new AppError("not_found", "not found", 404));
    expect((await getHermitConversation(new Request("http://localhost/api/hermit/conversations/foreign?userId=owner"), "foreign")).status).toBe(404);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith("employee-a", "foreign");
  });

  it("restores available attachments, flags expired ones, and clears inaccessible document context", async () => {
    mocks.get.mockResolvedValue({ id: "one", title: "Question", messages: [{ externalMessageId: "a", role: "ASSISTANT", content: "partial", metadataJson: {
      hermitStatus: "failed", hermit: { version: 1, attachments: [{ id: "valid", name: "valid.txt", size: 12 }, { id: "expired", name: "old.txt", size: 13 }], documentContext: { resourceId: "guide", versionId: "v1", title: "Old", source: "Hub" } },
    } }] });
    mocks.resolve.mockImplementation(async (_principal, ids) => { if (ids[0] === "expired") throw new Error("expired"); return [{ id: "valid", name: "valid.txt", size: 12, text: "private text" }]; });
    mocks.document.mockRejectedValue(new Error("retired"));
    const result = await (await getHermitConversation(new Request("http://localhost/api/hermit/conversations/one"), "one")).json();
    expect(result).toMatchObject({ messages: [{ metadata: { hermitStatus: "failed" } }], attachments: [{ id: "valid", name: "valid.txt", size: 12 }], unavailableAttachments: [{ id: "expired", name: "old.txt" }], documentContext: null });
    expect(JSON.stringify(result)).not.toContain("private text");
    expect(mocks.resolve.mock.calls[0][0]).toEqual(principal);
  });

  const selectedSkill = { resourceId: "method", versionId: "s1", title: "原方法标题", source: "原来源" };
  const sessionWithSkill = () => ({ id: "one", title: "Question", messages: [{ externalMessageId: "a", role: "ASSISTANT", content: "answer", metadataJson: {
    hermitStatus: "complete", hermit: { version: 1, attachments: [], documentContext: null, skillContext: selectedSkill },
  } }] });
  const restore = async () => (await getHermitConversation(new Request("http://localhost/api/hermit/conversations/one"), "one")).json();

  it("revalidates the exact Skill version and returns fresh server metadata without preloading its method", async () => {
    mocks.get.mockResolvedValue(sessionWithSkill());
    mocks.document.mockResolvedValue({ id: "method", type: "skill", title: "当前标题", source: "当前来源", archived: false, validity: "effective", version: { id: "s1", publishedAt: "2026-10-27", markdown: "PRIVATE_METHOD_BODY" } });
    const result = await restore();
    expect(result).toMatchObject({ skillContext: { ...selectedSkill, title: "当前标题", source: "当前来源" }, unavailableSkillContext: null, documentContext: null });
    expect(mocks.document).toHaveBeenCalledExactlyOnceWith("method", "s1");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_METHOD_BODY");
  });

  it.each(["denied", "wrong-type", "expired", "scheduled", "draft", "archived", "wrong-version", "hub-disabled"])("clears active context and flags an unavailable historical Skill: %s", async state => {
    mocks.get.mockResolvedValue(sessionWithSkill());
    mocks.enabled = state !== "hub-disabled";
    if (state === "denied") mocks.document.mockRejectedValue(new Error("SECRET_CURRENT_METADATA"));
    else mocks.document.mockResolvedValue({ id: "method", type: state === "wrong-type" ? "document" : "skill", title: "SECRET_CURRENT_METADATA", source: "current", archived: state === "archived",
      validity: ["expired", "scheduled"].includes(state) ? state : "effective", version: { id: state === "wrong-version" ? "other" : "s1", publishedAt: state === "draft" ? null : "2026-10-27" } });
    const result = await restore();
    expect(result).toMatchObject({ skillContext: null, unavailableSkillContext: { ...selectedSkill, message: "原来选择的平台 Skill 已不可用，请重新选择后再使用。" } });
    expect(JSON.stringify(result)).not.toContain("SECRET_CURRENT_METADATA");
    if (state === "hub-disabled") expect(mocks.document).not.toHaveBeenCalled();
  });

  it.each([undefined, null])("returns both Skill fields as null for legacy or unselected history: %j", async skillContext => {
    const session = sessionWithSkill();
    mocks.get.mockResolvedValue({ ...session, messages: [{ ...session.messages[0], metadataJson: { hermitStatus: "complete", hermit: { version: 1, attachments: [], documentContext: null, ...(skillContext !== undefined ? { skillContext } : {}) } } }] });
    expect(await restore()).toMatchObject({ skillContext: null, unavailableSkillContext: null });
    expect(mocks.document).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ visitor: vi.fn(), list: vi.fn(), get: vi.fn(), resolve: vi.fn(), document: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireSiteVisitor: mocks.visitor, authErrorResponse: (error: { status?: number; message?: string }) => Response.json({ error: { message: error.message } }, { status: error.status ?? 503 }) }));
vi.mock("./repository", () => ({ hermitChatRepository: { listConversations: mocks.list, getConversation: mocks.get } }));
vi.mock("@/lib/hermit/attachments", () => ({ resolveHermitAttachments: mocks.resolve }));
vi.mock("@/modules/knowledge-hub/runtime", () => ({ isKnowledgeHubEnabled: () => true, getSiteKnowledgeHub: () => ({ get: mocks.document }) }));
import { listHermitConversations, getHermitConversation } from "./history-api";
import { AppError } from "@/shared/errors";
const principal = { kind: "employee", userId: "employee-a", channel: "web", grantId: "grant", credentialId: "web", capabilities: ["hermit:chat", "hermit:attachment:self"], expiresAt: Date.now() + 3600000 };
beforeEach(() => {
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
});

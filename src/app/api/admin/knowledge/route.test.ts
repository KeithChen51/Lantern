import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/shared/errors";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), mutation: vi.fn(), apply: vi.fn(), manager: vi.fn(), list: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireKnowledgeAdmin: mocks.guard, assertWebMutation: mocks.mutation,
  authErrorResponse: (error: { status?: number }) => Response.json({ error: "auth" }, { status: error.status ?? 503, headers: { "Cache-Control": "no-store" } }) }));
vi.mock("@/modules/knowledge-hub/manager", () => ({ createKnowledgeManager: mocks.manager, knowledgeManagerErrorResponse: () => null }));
import { GET, POST } from "./route";
const request = () => new Request("https://example.test/api/admin/knowledge", { method: "POST", body: JSON.stringify({ action: "createFolder", name: "资料", parentId: null }) });
const principal = { userId: "employee-1", account: "employee", grantId: "grant-1", credentialId: "session-1", capabilities: ["knowledge:manage"] };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "mysql://unused"); mocks.guard.mockResolvedValue(principal); mocks.manager.mockReturnValue({ apply: mocks.apply, list: mocks.list }); mocks.apply.mockResolvedValue({ ok: true }); });
describe("knowledge manager authorization", () => {
  it.each([401, 403, 503])("rejects invalid identity/role before parsing or writing (%s)", async status => {
    mocks.guard.mockRejectedValue(new AppError("forbidden", "denied", status));
    const incoming = request(); const json = vi.spyOn(incoming, "json");
    expect((await POST(incoming)).status).toBe(status); expect(json).not.toHaveBeenCalled(); expect(mocks.manager).not.toHaveBeenCalled();
    expect((await GET(incoming)).status).toBe(status);
  });
  it("requests fresh write role, validates CSRF and passes an employee audit actor", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.guard).toHaveBeenCalledTimes(2); expect(mocks.guard).toHaveBeenNthCalledWith(1, expect.any(Request), { write: true }); expect(mocks.guard).toHaveBeenNthCalledWith(2, expect.any(Request), { write: true }); expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(mocks.manager).toHaveBeenCalledWith(undefined, { userId: "employee-1", account: "employee", requestId: expect.any(String) });
  });
  it("blocks failed origin/CSRF before body consumption and storage", async () => {
    mocks.mutation.mockImplementationOnce(() => { throw new AppError("forbidden", "csrf", 403); });
    const incoming = request(); expect((await POST(incoming)).status).toBe(403); expect(incoming.bodyUsed).toBe(false); expect(mocks.manager).not.toHaveBeenCalled();
  });
  it("rechecks after body parsing and rejects a revoked authorization without applying", async () => {
    mocks.guard.mockResolvedValueOnce(principal).mockRejectedValueOnce(new AppError("unauthorized", "revoked", 401));
    const incoming = request();
    expect((await POST(incoming)).status).toBe(401);
    expect(incoming.bodyUsed).toBe(true);
    expect(mocks.manager).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("rejects revocation while a streamed JSON body is still arriving", async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } });
    const init = { method: "POST", body, duplex: "half" };
    const incoming = new Request("https://example.test/api/admin/knowledge", init);
    let checked!: () => void;
    const earlyGuard = new Promise<void>(resolve => { checked = resolve; });
    mocks.mutation.mockImplementationOnce(() => { checked(); });
    const response = POST(incoming);
    await earlyGuard;
    mocks.guard.mockRejectedValue(new AppError("unauthorized", "revoked", 401));
    streamController.enqueue(new TextEncoder().encode(JSON.stringify({ action: "createFolder", name: "资料", parentId: null })));
    streamController.close();
    expect((await response).status).toBe(401);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it.each(["userId", "account", "grantId", "credentialId"])("rejects changed %s between checks", async key => {
    mocks.guard.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, [key]: "changed" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("validates CSRF both before parsing and immediately before mutation", async () => {
    const incoming = request(), bodyUsed: boolean[] = [];
    mocks.mutation.mockImplementation(() => { bodyUsed.push(incoming.bodyUsed); });
    expect((await POST(incoming)).status).toBe(200);
    expect(bodyUsed).toEqual([false, true]);
  });
  it("stops mutation when the second CSRF check fails", async () => {
    mocks.mutation.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new AppError("forbidden", "csrf", 403); });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});

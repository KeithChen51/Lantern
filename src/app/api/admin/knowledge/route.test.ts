import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/shared/errors";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), mutation: vi.fn(), apply: vi.fn(), manager: vi.fn(), list: vi.fn() }));
vi.mock("@/modules/auth/access", () => ({ requireKnowledgeAdmin: mocks.guard, assertWebMutation: mocks.mutation,
  authErrorResponse: (error: { status?: number }) => Response.json({ error: "auth" }, { status: error.status ?? 503, headers: { "Cache-Control": "no-store" } }) }));
vi.mock("@/modules/knowledge-hub/manager", () => ({ createKnowledgeManager: mocks.manager, knowledgeManagerErrorResponse: () => null }));
import { GET, POST } from "./route";
const request = () => new Request("https://example.test/api/admin/knowledge", { method: "POST", body: JSON.stringify({ action: "createFolder", name: "资料", parentId: null }) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DATABASE_URL", "mysql://unused"); mocks.guard.mockResolvedValue({ userId: "employee-1", account: "employee", capabilities: ["knowledge:manage"] }); mocks.manager.mockReturnValue({ apply: mocks.apply, list: mocks.list }); mocks.apply.mockResolvedValue({ ok: true }); });
describe("knowledge manager authorization", () => {
  it.each([401, 403, 503])("rejects invalid identity/role before parsing or writing (%s)", async status => {
    mocks.guard.mockRejectedValue(new AppError("forbidden", "denied", status));
    const incoming = request(); const json = vi.spyOn(incoming, "json");
    expect((await POST(incoming)).status).toBe(status); expect(json).not.toHaveBeenCalled(); expect(mocks.manager).not.toHaveBeenCalled();
    expect((await GET(incoming)).status).toBe(status);
  });
  it("requests fresh write role, validates CSRF and passes an employee audit actor", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.guard).toHaveBeenCalledWith(expect.any(Request), { write: true }); expect(mocks.mutation).toHaveBeenCalledOnce();
    expect(mocks.manager).toHaveBeenCalledWith(undefined, { userId: "employee-1", account: "employee", requestId: expect.any(String) });
  });
  it("blocks failed origin/CSRF before body consumption and storage", async () => {
    mocks.mutation.mockImplementationOnce(() => { throw new AppError("forbidden", "csrf", 403); });
    const incoming = request(); expect((await POST(incoming)).status).toBe(403); expect(incoming.bodyUsed).toBe(false); expect(mocks.manager).not.toHaveBeenCalled();
  });
});

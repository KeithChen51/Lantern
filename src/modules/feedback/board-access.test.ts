import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/modules/auth/access-types";
const mocks = vi.hoisted(() => ({ employee: vi.fn(), manager: vi.fn(), mutation: vi.fn(), headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/modules/auth/access", async () => ({ ...(await vi.importActual("@/modules/auth/access-types")), requireEmployee: mocks.employee, requireFeedbackManager: mocks.manager, assertWebMutation: mocks.mutation }));
import { boardActor, requireFeedbackPage, requireFeedbackRequest, revalidateFeedbackWrite } from "./board-access";
const principal: Principal = { userId: "employee", account: "synthetic-account", displayName: "员工甲", grantId: "grant", credentialId: "session", channel: "web", capabilities: [], csrfToken: "csrf", expiresAt: Date.now() + 60000 };
beforeEach(() => { vi.clearAllMocks(); mocks.employee.mockResolvedValue(principal); mocks.manager.mockResolvedValue({ ...principal, capabilities: ["feedback:manage"] }); });
describe("suggestion employee boundary", () => {
  it("sends only the minimal employee identity and UI capabilities to the client", async () => {
    expect(await requireFeedbackPage()).toEqual({ userId: "employee", displayName: "员工甲", csrfToken: "csrf", canManage: false });
    expect(mocks.employee).toHaveBeenCalledWith(mocks.headers);
  });
  it.each([{ kind: "guest" }, { channel: "cli" }, { channel: "mcp" }])("never treats non-employee browser identities as participants: %j", async extra => {
    mocks.employee.mockResolvedValue({ ...principal, ...extra });
    await expect(requireFeedbackPage()).rejects.toMatchObject({ status: 403 });
    await expect(requireFeedbackRequest(new Request("https://app.invalid/api/feedback"))).rejects.toMatchObject({ status: 403 });
  });
  it("does not give a knowledge administrator suggestion decision authority", () => {
    expect(boardActor({ ...principal, capabilities: ["knowledge:manage"] }).canManage).toBe(false);
  });
  it("uses fresh admin authorization and verifies mutation proof", async () => {
    const request = new Request("https://app.invalid/api/feedback/id", { method: "PATCH" });
    await requireFeedbackRequest(request, { manage: true, write: true });
    expect(mocks.manager).toHaveBeenCalledWith(request);
    expect(mocks.mutation).toHaveBeenCalledWith(request, expect.objectContaining({ capabilities: ["feedback:manage"] }));
  });
  it.each(["userId", "grantId", "credentialId"])("rejects changes to %s while a body is read", async key => {
    mocks.employee.mockResolvedValue({ ...principal, [key]: "another" });
    await expect(revalidateFeedbackWrite(new Request("https://app.invalid/api/feedback"), principal)).rejects.toMatchObject({ status: 403 });
  });
});

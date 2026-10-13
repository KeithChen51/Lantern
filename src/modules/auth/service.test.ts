import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/shared/errors";
const employee = vi.hoisted(() => vi.fn());
vi.mock("./access", () => ({ requireEmployee: employee }));
import { createAuthService } from "./service";
import type { AuthRepository } from "./types";
const repository: AuthRepository = {
  findUserById: async id => id === "verified-user" ? { id, displayName: "Fixture employee", roles: ["highest_admin"] } : null,
  findDemoNormalUser: async () => ({ id: "demo", displayName: "Demo", roles: ["normal_user"] }),
  findDemoHighestAdmin: async () => ({ id: "admin-demo", displayName: "Demo admin", roles: ["highest_admin"] }),
  findIdentityAccount: async () => null,
};
beforeEach(() => { employee.mockReset(); });
describe("legacy facade requires a verified employee", () => {
  it.each([undefined, { userId: "admin-demo" }, { headers: { "x-lighthouse-user-id": "admin-demo" } }, { headers: { cookie: "lighthouse_preview_user_id=admin-demo" } }])("does not trust a caller-supplied identity", async context => {
    employee.mockRejectedValue(new AppError("unauthorized", "Login required", 401));
    await expect(createAuthService(repository).getCurrentUser(context)).rejects.toMatchObject({ status: 401 });
  });
  it("uses only the trusted mapped user and drops legacy roles", async () => {
    employee.mockResolvedValue({ userId: "verified-user" });
    await expect(createAuthService(repository).getCurrentUser({ userId: "admin-demo" })).resolves.toMatchObject({ id: "verified-user", roles: ["normal_user"] });
  });
  it("never grants highest_admin through the old helper", async () => {
    await expect(createAuthService(repository).getCurrentAdmin({ userId: "admin-demo" })).rejects.toMatchObject({ status: 403 });
  });
});

import { describe, expect, it } from "vitest";
import { createAuthService } from "./service";
import type { AuthRepository, AuthUserRecord, IdentityAccountRecord } from "./types";

class MemoryAuthRepository implements AuthRepository {
  constructor(
    private readonly users: Record<string, AuthUserRecord>,
    private readonly identities: IdentityAccountRecord[],
  ) {}

  async findUserById(userId: string) {
    return this.users[userId] ?? null;
  }

  async findDemoNormalUser() {
    return this.users["user-demo"] ?? null;
  }

  async findDemoHighestAdmin() {
    return this.users["admin-demo"] ?? null;
  }

  async findIdentityAccount(provider: string, providerUserId: string) {
    return (
      this.identities.find(
        (identity) => identity.provider === provider && identity.providerUserId === providerUserId,
      ) ?? null
    );
  }
}

const normalUser: AuthUserRecord = {
  id: "user-demo",
  displayName: "李明",
  roles: ["normal_user"],
};

const highestAdmin: AuthUserRecord = {
  id: "admin-demo",
  displayName: "品牌方管理员",
  roles: ["highest_admin"],
};

function createRepository() {
  return new MemoryAuthRepository(
    {
      [normalUser.id]: normalUser,
      [highestAdmin.id]: highestAdmin,
    },
    [{ id: "identity-1", userId: normalUser.id, provider: "oa", providerUserId: "oa-li-ming" }],
  );
}

describe("auth service", () => {
  it("resolves the demo normal user by default", async () => {
    const service = createAuthService(createRepository());

    await expect(service.getCurrentUser()).resolves.toMatchObject({
      id: "user-demo",
      roles: ["normal_user"],
    });
  });

  it("resolves the demo highest admin", async () => {
    const service = createAuthService(createRepository());

    await expect(service.getCurrentAdmin()).resolves.toMatchObject({
      id: "admin-demo",
      roles: ["highest_admin"],
    });
  });

  it("maps a provider identity to the internal user", async () => {
    const service = createAuthService(createRepository());

    await expect(service.resolveIdentityAccount("oa", "oa-li-ming")).resolves.toMatchObject({
      id: "user-demo",
      displayName: "李明",
    });
  });
});

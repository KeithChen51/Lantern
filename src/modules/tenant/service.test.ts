import { describe, expect, it } from "vitest";
import { createTenantService } from "./service";
import type { TenantRepository, TenantUserRecord } from "./types";

class MemoryTenantRepository implements TenantRepository {
  constructor(private readonly users: Record<string, TenantUserRecord>) {}

  async findUserById(userId: string) {
    return this.users[userId] ?? null;
  }
}

const normalUser: TenantUserRecord = {
  id: "user-demo",
  displayName: "李明",
  primaryBrandId: "brand-demo",
  primaryRegionId: "region-east",
  primaryDealerId: "dealer-demo",
  primaryStoreId: "store-xinghe",
  roles: [{ role: "normal_user", scopeType: "store", scopeId: "store-xinghe" }],
};

const highestAdmin: TenantUserRecord = {
  id: "admin-demo",
  displayName: "品牌方管理员",
  primaryBrandId: "brand-demo",
  primaryRegionId: null,
  primaryDealerId: null,
  primaryStoreId: null,
  roles: [{ role: "highest_admin", scopeType: "brand", scopeId: "brand-demo" }],
};

describe("tenant service", () => {
  it("resolves a normal user to the primary store scope", async () => {
    const service = createTenantService(new MemoryTenantRepository({ [normalUser.id]: normalUser }));

    const scope = await service.getUserOrgScope(normalUser.id);

    expect(scope).toMatchObject({
      userId: "user-demo",
      role: "normal_user",
      scopeType: "store",
      brandId: "brand-demo",
      regionId: "region-east",
      dealerId: "dealer-demo",
      storeId: "store-xinghe",
    });
  });

  it("resolves the highest admin to the brand scope", async () => {
    const service = createTenantService(new MemoryTenantRepository({ [highestAdmin.id]: highestAdmin }));

    const scope = await service.getUserOrgScope(highestAdmin.id);

    expect(scope).toMatchObject({
      userId: "admin-demo",
      role: "highest_admin",
      scopeType: "brand",
      brandId: "brand-demo",
    });
    expect(scope.storeId).toBeNull();
  });

  it("builds an organization where filter from resolved scope", async () => {
    const service = createTenantService(new MemoryTenantRepository({ [normalUser.id]: normalUser }));
    const scope = await service.getUserOrgScope(normalUser.id);

    expect(service.buildOrgWhere(scope)).toEqual({
      brandId: "brand-demo",
      regionId: "region-east",
      dealerId: "dealer-demo",
      storeId: "store-xinghe",
    });
  });

  it("blocks a store-scoped user from accessing a different store", async () => {
    const service = createTenantService(new MemoryTenantRepository({ [normalUser.id]: normalUser }));
    const scope = await service.getUserOrgScope(normalUser.id);

    expect(() => service.assertCanAccessStore(scope, "store-xinghe")).not.toThrow();
    expect(() => service.assertCanAccessStore(scope, "store-other")).toThrow(/store scope/i);
  });
});

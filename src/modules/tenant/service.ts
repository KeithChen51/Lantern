import { AppError } from "@/shared/errors";
import type { OrgScope, OrgWhere, TenantRepository, TenantUserRecord } from "./types";

function resolveRole(user: TenantUserRecord) {
  return user.roles.some((role) => role.role === "highest_admin") ? "highest_admin" : "normal_user";
}

function resolveScopeType(user: TenantUserRecord): OrgScope["scopeType"] {
  if (resolveRole(user) === "highest_admin") {
    return user.primaryBrandId ? "brand" : "global";
  }

  if (user.primaryStoreId) return "store";
  if (user.primaryDealerId) return "dealer";
  if (user.primaryRegionId) return "region";
  if (user.primaryBrandId) return "brand";
  return "global";
}

export class TenantService {
  constructor(private readonly repository: TenantRepository) {}

  async getUserOrgScope(userId: string): Promise<OrgScope> {
    const user = await this.repository.findUserById(userId);

    if (!user) {
      throw new AppError("not_found", `User ${userId} was not found.`, 404);
    }

    const role = resolveRole(user);
    const scopeType = resolveScopeType(user);

    return {
      userId: user.id,
      role,
      scopeType,
      brandId: user.primaryBrandId,
      regionId: role === "highest_admin" ? null : user.primaryRegionId,
      dealerId: role === "highest_admin" ? null : user.primaryDealerId,
      storeId: role === "highest_admin" ? null : user.primaryStoreId,
    };
  }

  buildOrgWhere(scope: OrgScope): OrgWhere {
    const where: OrgWhere = {};

    if (scope.brandId) where.brandId = scope.brandId;
    if (scope.scopeType === "region" || scope.scopeType === "dealer" || scope.scopeType === "store") {
      if (scope.regionId) where.regionId = scope.regionId;
    }
    if (scope.scopeType === "dealer" || scope.scopeType === "store") {
      if (scope.dealerId) where.dealerId = scope.dealerId;
    }
    if (scope.scopeType === "store" && scope.storeId) {
      where.storeId = scope.storeId;
    }

    return where;
  }

  assertCanAccessStore(scope: OrgScope, storeId: string | null | undefined) {
    if (!storeId || scope.scopeType !== "store") {
      return;
    }

    if (scope.storeId !== storeId) {
      throw new AppError("forbidden", "Store scope does not allow access to this store.", 403);
    }
  }
}

export function createTenantService(repository: TenantRepository) {
  return new TenantService(repository);
}

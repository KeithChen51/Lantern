import { AppRole as PrismaAppRole, ScopeType as PrismaScopeType, type Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import type { AppRole, ScopeType, TenantRepository, TenantUserRecord } from "./types";

type PrismaUserWithRoles = Prisma.UserGetPayload<{
  include: { roles: true };
}>;

function mapRole(role: PrismaAppRole): AppRole {
  return role === PrismaAppRole.HIGHEST_ADMIN ? "highest_admin" : "normal_user";
}

function mapScopeType(scopeType: PrismaScopeType): ScopeType {
  return scopeType.toLowerCase() as ScopeType;
}

function mapUser(user: PrismaUserWithRoles): TenantUserRecord {
  return {
    id: user.id,
    displayName: user.displayName,
    primaryBrandId: user.primaryBrandId,
    primaryRegionId: user.primaryRegionId,
    primaryDealerId: user.primaryDealerId,
    primaryStoreId: user.primaryStoreId,
    roles: user.roles.map((role) => ({
      role: mapRole(role.role),
      scopeType: mapScopeType(role.scopeType),
      scopeId: role.scopeId,
    })),
  };
}

export class PrismaTenantRepository implements TenantRepository {
  async findUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });

    return user ? mapUser(user) : null;
  }
}

export const tenantRepository = new PrismaTenantRepository();

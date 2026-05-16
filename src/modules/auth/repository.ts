import { AppRole as PrismaAppRole, type Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import type { AppRole } from "@/modules/tenant";
import type { AuthRepository, AuthUserRecord } from "./types";

type PrismaUserWithRoles = Prisma.UserGetPayload<{
  include: { roles: true };
}>;

function mapRole(role: PrismaAppRole): AppRole {
  return role === PrismaAppRole.HIGHEST_ADMIN ? "highest_admin" : "normal_user";
}

function mapUser(user: PrismaUserWithRoles): AuthUserRecord {
  return {
    id: user.id,
    displayName: user.displayName,
    roles: user.roles.map((role) => mapRole(role.role)),
  };
}

export class PrismaAuthRepository implements AuthRepository {
  async findUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });

    return user ? mapUser(user) : null;
  }

  async findDemoNormalUser() {
    const user = await prisma.user.findFirst({
      where: {
        roles: { some: { role: PrismaAppRole.NORMAL_USER } },
      },
      include: { roles: true },
      orderBy: { createdAt: "asc" },
    });

    return user ? mapUser(user) : null;
  }

  async findDemoHighestAdmin() {
    const user = await prisma.user.findFirst({
      where: {
        roles: { some: { role: PrismaAppRole.HIGHEST_ADMIN } },
      },
      include: { roles: true },
      orderBy: { createdAt: "asc" },
    });

    return user ? mapUser(user) : null;
  }

  async findIdentityAccount(provider: string, providerUserId: string) {
    return prisma.identityAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
    });
  }
}

export const authRepository = new PrismaAuthRepository();

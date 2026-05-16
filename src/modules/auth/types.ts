import type { AppRole } from "@/modules/tenant";

export type AuthUserRecord = {
  id: string;
  displayName: string;
  roles: AppRole[];
};

export type IdentityAccountRecord = {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
};

export type AuthRequestContext = {
  userId?: string | null;
  headers?: Headers | Record<string, string | undefined>;
};

export interface AuthRepository {
  findUserById(userId: string): Promise<AuthUserRecord | null>;
  findDemoNormalUser(): Promise<AuthUserRecord | null>;
  findDemoHighestAdmin(): Promise<AuthUserRecord | null>;
  findIdentityAccount(provider: string, providerUserId: string): Promise<IdentityAccountRecord | null>;
}

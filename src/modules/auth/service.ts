import { AppError } from "@/shared/errors";
import type { AuthRepository, AuthRequestContext, AuthUserRecord } from "./types";

/** Caller-supplied IDs and preview cookies confer no identity. */
export class AuthService {
  constructor(private readonly repository: AuthRepository) {}
  async getCurrentUser(context?: AuthRequestContext): Promise<AuthUserRecord> {
    const { requireEmployee } = await import("./access");
    const headers = context?.headers instanceof Headers ? context.headers : new Headers(
      Object.entries(context?.headers ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    const principal = await requireEmployee(headers);
    const user = await this.repository.findUserById(principal.userId);
    if (!user) throw new AppError("unauthorized", "Employee account is unavailable.", 401);
    return { ...user, roles: ["normal_user"] };
  }
  async getCurrentAdmin(context?: AuthRequestContext): Promise<AuthUserRecord> {
    void context;
    throw new AppError("forbidden", "Legacy highest-admin access is disabled.", 403);
  }
  async resolveIdentityAccount(provider: string, providerUserId: string): Promise<AuthUserRecord> {
    const identity = await this.repository.findIdentityAccount(provider, providerUserId);
    const user = identity ? await this.repository.findUserById(identity.userId) : null;
    if (!user) throw new AppError("not_found", "Identity account was not found.", 404);
    return user;
  }
}
export function createAuthService(repository: AuthRepository) { return new AuthService(repository); }

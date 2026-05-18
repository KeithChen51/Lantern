import { AppError } from "@/shared/errors";
import { PREVIEW_USER_COOKIE } from "./preview";
import type { AuthRepository, AuthRequestContext, AuthUserRecord } from "./types";

function readHeader(context: AuthRequestContext | undefined, name: string) {
  const headers = context?.headers;
  if (!headers) return null;

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function readCookie(context: AuthRequestContext | undefined, name: string) {
  const rawCookie = readHeader(context, "cookie");
  if (!rawCookie) return null;

  for (const part of rawCookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== name) continue;
    const value = rawValue.join("=");
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async getCurrentUser(context?: AuthRequestContext): Promise<AuthUserRecord> {
    const requestedUserId =
      context?.userId ?? readHeader(context, "x-lighthouse-user-id") ?? readCookie(context, PREVIEW_USER_COOKIE);
    if (requestedUserId) {
      const user = await this.repository.findUserById(requestedUserId);
      if (!user) {
        throw new AppError("unauthorized", "Requested user was not found.", 401);
      }
      return user;
    }

    const demoUser = await this.repository.findDemoNormalUser();
    if (!demoUser) {
      throw new AppError("unauthorized", "Demo normal user is not seeded.", 401);
    }

    return demoUser;
  }

  async getCurrentAdmin(context?: AuthRequestContext): Promise<AuthUserRecord> {
    const requestedUserId =
      context?.userId ?? readHeader(context, "x-lighthouse-admin-id") ?? readCookie(context, PREVIEW_USER_COOKIE);
    if (requestedUserId) {
      const user = await this.repository.findUserById(requestedUserId);
      if (!user?.roles.includes("highest_admin")) {
        throw new AppError("forbidden", "Highest-admin role is required.", 403);
      }
      return user;
    }

    throw new AppError("forbidden", "Highest-admin role is required.", 403);
  }

  async resolveIdentityAccount(provider: string, providerUserId: string): Promise<AuthUserRecord> {
    const identity = await this.repository.findIdentityAccount(provider, providerUserId);
    if (!identity) {
      throw new AppError("not_found", "Identity account was not found.", 404);
    }

    const user = await this.repository.findUserById(identity.userId);
    if (!user) {
      throw new AppError("not_found", "Identity account points to a missing user.", 404);
    }

    return user;
  }
}

export function createAuthService(repository: AuthRepository) {
  return new AuthService(repository);
}

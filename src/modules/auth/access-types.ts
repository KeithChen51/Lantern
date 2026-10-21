import { AppError } from "@/shared/errors";
import type { IamLoginConfig } from "./iam-config";

export type Capability = "content:read" | "knowledge:read" | "hermit:chat" | "hermit:attachment:self" | "auth:client:self" | "knowledge:manage";
export type Principal = {
  kind?: "employee" | "guest";
  userId: string; account: string; displayName: string;
  organization?: string; avatarUrl?: string;
  grantId: string; credentialId: string; channel: "web" | "cli" | "mcp";
  capabilities: readonly Capability[]; csrfToken?: string; expiresAt: number;
};
export const EMPLOYEE_CAPABILITIES: readonly Capability[] = ["content:read", "knowledge:read", "hermit:chat", "hermit:attachment:self", "auth:client:self"];
export class AccessError extends AppError {
  constructor(message: string, status: 400 | 401 | 403 | 409 | 429 | 503 = 401) {
    super(status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 503 ? "integration_error" : "bad_request", message, status);
  }
}
export class OAuthError extends Error {
  constructor(public readonly error: string, public readonly status = 400) { super(error); }
}
export type PortalIdentity = { account: string; displayName: string; expiresAt?: number };
export type PortalAuthorization = { roles: readonly string[]; organization?: string };
export interface PortalAdapter {
  exchange?(code: string): Promise<{ token: string; expiresAt: number }>;
  authorizationUrl?(redirectUri: string, state: string): string;
  identity(token: string): Promise<PortalIdentity>;
  roles(account: string): Promise<readonly string[]>;
  authorization?(account: string): Promise<PortalAuthorization>;
}
export type AccessConfig = {
  mode?: "portal" | "iam"; iam?: IamLoginConfig;
  iamAuthorizationSource?: "sync" | "portal";
  origin: string; portalBaseUrl: string; portalLoginUrl: string;
  appCode: string; appSecret: string; adminRole: string; encryptionKey: string;
  portalLoginMode?: "card" | "callback"; platformAdminRole?: string;
  callbackParam: string; stateParam: string; tokenParam: string;
  allowLegacyConfirmation: boolean; secureCookies: boolean;
  sessionCookie: string; transactionCookie: string; pendingCookie: string;
  sessionAbsoluteMs: number; sessionIdleMs: number; identityFreshMs: number;
  roleFreshMs: number; adminWriteFreshMs: number; deviceMs: number;
  accessMs: number; clientMs: number; transactionMs: number;
};

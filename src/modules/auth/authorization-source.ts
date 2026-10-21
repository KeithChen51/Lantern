import type { AccessConfig } from "./access-types";

type AuthorizationConfig = Pick<AccessConfig, "mode" | "iamAuthorizationSource">;

export function usesIamPortalAuthorization(config: AuthorizationConfig): boolean {
  return config.mode === "iam" && config.iamAuthorizationSource === "portal";
}

export function usesIamSyncAuthorization(config: AuthorizationConfig): boolean {
  return config.mode === "iam" && (config.iamAuthorizationSource === undefined || config.iamAuthorizationSource === "sync");
}

export function accessAuthority(config: AuthorizationConfig): "portal" | "iam" | "iam-portal" {
  return config.mode === "iam" ? usesIamPortalAuthorization(config) ? "iam-portal" : "iam" : "portal";
}

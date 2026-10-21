import { AccessError, type AccessConfig, type PortalAdapter } from "./access-types";
import { usesIamPortalAuthorization, usesIamSyncAuthorization } from "./authorization-source";
import { IamIdentityClient } from "./iam";
import { HttpPortalAdapter } from "./portal";

/** Keep identity credentials confined to IAM; the portal sees only the account. */
export function createAccessProvider(config: AccessConfig, fetcher: typeof fetch = fetch, now: () => number = Date.now): PortalAdapter {
  if (config.mode !== "iam") return new HttpPortalAdapter(config, fetcher, now);
  if (!config.iam || (!usesIamPortalAuthorization(config) && !usesIamSyncAuthorization(config))) {
    throw new AccessError("IAM authorization is not configured", 503);
  }
  const iam = new IamIdentityClient(config.iam, fetcher, now);
  const portal = usesIamPortalAuthorization(config) ? new HttpPortalAdapter(config, fetcher, now) : undefined;
  return {
    identity: token => iam.identity(token),
    exchange: code => iam.exchange(code),
    authorizationUrl: (uri, state) => iam.authorizationUrl(uri, state),
    roles: portal ? account => portal.roles(account) : async () => { throw new AccessError("IAM directory authorization is required", 503); },
    ...(portal ? { authorization: (account: string) => portal.authorization(account) } : {}),
  };
}

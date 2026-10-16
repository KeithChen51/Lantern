import { createHash } from "node:crypto";
import type { AccessRecord, AccessStore, AccessTransaction } from "./access-store";
import { AccessError } from "./access-types";

export const IAM_ROLES = [
  { code: "lighthouse_user", name: "灯塔用户", description: "阅读灯塔内容和知识资料，使用路引与个人客户端授权" },
  { code: "lighthouse_knowledge_admin", name: "灯塔知识管理员", description: "灯塔用户能力及知识资料管理" },
  { code: "lighthouse_admin", name: "灯塔管理员", description: "当前开放能力为灯塔用户能力及知识资料管理" },
] as const;
const KNOWN_ROLES = new Set<string>(IAM_ROLES.map(role => role.code));
const DURABLE_EXPIRY = 253402300799000;
const id = (kind: string, values: string[]) => `${kind}:${createHash("sha256").update(JSON.stringify(values)).digest("hex")}`;
const accountId = (account: string) => id("iam-account", [account]);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccessError("Invalid IAM synchronization payload", 400);
  return value as Record<string, unknown>;
}
function text(value: unknown, empty = false, max = 128): string {
  if (typeof value !== "string" || (!empty && !value.length) || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) throw new AccessError("Invalid IAM synchronization field", 400);
  return value;
}
function action(value: unknown, allowed: number[]) {
  const parsed = typeof value === "string" && /^[012]$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !allowed.includes(parsed)) throw new AccessError("Unsupported IAM synchronization action", 400);
  return parsed;
}
function disabled(value: unknown): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new AccessError("Invalid IAM account status", 400);
}
function timestamp(value: unknown): number {
  const parsed = typeof value === "string" && /^\d{1,15}$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed <= 0 || parsed > DURABLE_EXPIRY) throw new AccessError("Invalid IAM permission expiry", 400);
  return parsed;
}

export async function readIamDirectory(tx: AccessTransaction, account: string, now: number): Promise<{ displayName: string; organization?: string; roles: string[]; expiresAt: number }> {
  const entry = await tx.get("iamAccount", accountId(account));
  if (!entry?.payload.active || entry.payload.deleted) throw new AccessError("IAM account is not active", 403);
  const permissions = (await tx.find("iamPermission", { subjectId: account })).filter(record => record.payload.active && record.payload.validUntil > now && KNOWN_ROLES.has(record.payload.role));
  if (!permissions.length) throw new AccessError("IAM access has not been granted", 403);
  return { displayName: entry.payload.displayName, ...(entry.payload.organization ? { organization: entry.payload.organization } : {}), roles: [...new Set(permissions.map(record => record.payload.role))].sort(), expiresAt: Math.min(...permissions.map(record => record.payload.validUntil)) };
}

async function invalidateIamGrants(tx: AccessTransaction, account: string, now: number) {
  const grants = await tx.find("grant", { subjectId: account, activeOnly: true, expiresAfter: now });
  for (const grant of grants) if (grant.payload.authority === "iam") await tx.put({ ...grant, payload: { ...grant.payload, active: false }, updatedAt: now });
}

/** Projection of signed upstream events. IAM does not document sequence IDs;
 * receipts only deduplicate exact JWT+ciphertext retries during JWT validity.
 * An identical envelope remains a retry after intervening changes; an intended
 * fresh add must have a fresh JWT. Upstream reconciliation is still required
 * for uncertain delivery/order and must not be inferred from these receipts. */
export class IamDirectorySync {
  constructor(private readonly store: AccessStore, private readonly now: () => number = Date.now) {}

  async account(value: unknown, deliveryId: string, deliveryExpiresAt: number): Promise<void> {
    const event = object(value), user = object(event.userInfo), operation = action(event.actionType, [0, 1, 2]);
    const account = text(user.username);
    const displayName = user.fullname === undefined ? undefined : text(user.fullname, false, 256);
    // organization is an optional explicitly registered profile field; no guessing
    // across department/organization structures returned by other integrations.
    const organization = user.organization === undefined ? undefined : text(user.organization, true, 512);
    const isDisabled = user.isDisabled === undefined ? undefined : disabled(user.isDisabled);
    await this.store.transaction(async tx => {
      const now = this.now();
      const delivered = await tx.get("iamDelivery", deliveryId);
      if (delivered && delivered.expiresAt > now) return;
      const previous = await tx.get("iamAccount", accountId(account));
      const payload = {
        account, displayName: displayName ?? previous?.payload.displayName ?? account,
        ...((organization ?? previous?.payload.organization) ? { organization: organization ?? previous?.payload.organization } : {}),
        active: operation !== 2 && (isDisabled !== undefined ? !isDisabled : previous ? previous.payload.active && !previous.payload.deleted : operation === 0),
        deleted: operation === 2,
      };
      const changed = JSON.stringify(previous?.payload) !== JSON.stringify(payload);
      if (changed) {
        await tx.put({ id: accountId(account), kind: "iamAccount", subjectId: account, parentId: null, payload, expiresAt: DURABLE_EXPIRY, createdAt: previous?.createdAt ?? now, updatedAt: now });
        if (operation === 2) for (const permission of await tx.find("iamPermission", { subjectId: account })) {
          if (permission.payload.active) await tx.put({ ...permission, payload: { ...permission.payload, active: false }, updatedAt: now });
        }
        await invalidateIamGrants(tx, account, now);
      }
      await this.receipt(tx, "account", account, deliveryId, deliveryExpiresAt, now);
    });
  }

  async permission(value: unknown, deliveryId: string, deliveryExpiresAt: number): Promise<void> {
    const event = object(value), permission = object(event.permissionInfo), operation = action(event.actionType, [0, 2]);
    const account = text(permission.username), role = text(permission.roleCode), postCode = text(permission.postCode, true);
    if (!KNOWN_ROLES.has(role)) throw new AccessError("Unsupported IAM role", 400);
    if (permission.dataRanges !== undefined && (!Array.isArray(permission.dataRanges) || permission.dataRanges.length)) throw new AccessError("IAM data ranges are not supported", 400);
    const validUntil = operation === 0 ? timestamp(permission.expiresTime) : permission.expiresTime === undefined ? 0 : timestamp(permission.expiresTime);
    const permissionId = id("iam-permission", [account, role, postCode]);
    await this.store.transaction(async tx => {
      const now = this.now();
      const delivered = await tx.get("iamDelivery", deliveryId);
      if (delivered && delivered.expiresAt > now) return;
      const previous = await tx.get("iamPermission", permissionId);
      const payload = { account, role, postCode, active: operation === 0, validUntil: operation === 0 ? validUntil : previous?.payload.validUntil ?? validUntil };
      if (JSON.stringify(previous?.payload) !== JSON.stringify(payload)) {
        await tx.put({ id: permissionId, kind: "iamPermission", subjectId: account, parentId: null, payload, expiresAt: DURABLE_EXPIRY, createdAt: previous?.createdAt ?? now, updatedAt: now });
        await invalidateIamGrants(tx, account, now);
      }
      await this.receipt(tx, "permission", account, deliveryId, deliveryExpiresAt, now);
    });
  }

  private async receipt(tx: AccessTransaction, endpoint: "account" | "permission", account: string, deliveryId: string, expiresAt: number, now: number) {
    const record: AccessRecord<"iamDelivery"> = { id: deliveryId, kind: "iamDelivery", subjectId: account, parentId: null, payload: { endpoint }, expiresAt, createdAt: now, updatedAt: now };
    await tx.put(record);
  }
}

export function iamRoleCatalogue(appKey: string, now: number) {
  return { appKey, actionType: 3, syncTime: now, details: IAM_ROLES.map(role => ({ dataCode: role.code, dataName: role.name, description: role.description, dataRange: "0", dataRangeRelation: "0", grantType: "0,1,2", syncTime: now })) };
}
export function iamMenuCatalogue(appKey: string, now: number) {
  const readMenus = [
    { menuCode: "lighthouse-home", menuName: "本心", menuPath: "/" },
    { menuCode: "lighthouse-mirror", menuName: "镜鉴", menuPath: "/mirror" },
    { menuCode: "lighthouse-action", menuName: "笃行", menuPath: "/action" },
    { menuCode: "lighthouse-games", menuName: "启航", menuPath: "/games" },
    { menuCode: "lighthouse-hermit", menuName: "路引", menuPath: "/hermit" },
    { menuCode: "lighthouse-me", menuName: "我的", menuPath: "/me" },
    { menuCode: "lighthouse-updates", menuName: "版本消息", menuPath: "/updates" },
  ];
  return { appKey, actionType: 3, syncTime: now, details: IAM_ROLES.flatMap(role => [
    ...readMenus.map(menu => ({ roleCode: role.code, ...menu })),
    ...(role.code === "lighthouse_user" ? [] : [{ roleCode: role.code, menuCode: "lighthouse-knowledge-admin", menuName: "知识管理", menuPath: "/admin/knowledge" }]),
  ]) };
}

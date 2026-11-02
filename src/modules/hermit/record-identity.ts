import { Prisma, type PrismaClient } from "@prisma/client";
import { readAccessConfig } from "@/modules/auth/access-config";
import { accessAuthority } from "@/modules/auth/authorization-source";

export type HermitRecordIdentity = {
  employeeNo: string | null;
  account: string | null;
  organization: string | null;
  source: "session-snapshot" | "current-profile" | "unavailable";
};

export type HermitIdentitySnapshot = { version: 1; employeeNo: string | null; account: string | null; organization: string | null };
export const unavailableRecordIdentity: HermitRecordIdentity = { employeeNo: null, account: null, organization: null, source: "unavailable" };

export function identityText(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}

export function readIdentitySnapshot(value: unknown): HermitIdentitySnapshot | null {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== "object" || Array.isArray(value) || !("version" in value) || value.version !== 1) return null;
  const snapshot = value as Record<string, unknown>;
  return { version: 1, employeeNo: identityText(snapshot.employeeNo, 191), account: identityText(snapshot.account, 191), organization: identityText(snapshot.organization, 1000) };
}

type CurrentProfile = { employeeNo: unknown; organization: unknown };
type IdentityRow = { id: string; snapshot: unknown; employeeNo: unknown; account: unknown; accountCount: number | bigint; currentProfile: unknown; directoryProfile: unknown };
type IdentityOptions = { database: Pick<PrismaClient, "$queryRaw">; now?: Date; authority?: "portal" | "iam" | "iam-portal" };

function currentAuthority(): string {
  try { return accessAuthority(readAccessConfig()); } catch { return ""; }
}

function readCurrentProfile(value: unknown): CurrentProfile | null {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as CurrentProfile;
}

/** Read only bounded display fields, never authorization payloads or IAM input. */
export async function readRecordIdentities(ids: string[], options: IdentityOptions): Promise<Map<string, HermitRecordIdentity>> {
  if (!ids.length) return new Map();
  const now = options.now ?? new Date();
  const authority = options.authority ?? currentAuthority();
  // MySQL 5.7 may null the entire JSON_OBJECT when CASE reads an absent JSON
  // member. Choose its known employee-number path while constructing SQL.
  const rows = await options.database.$queryRaw<IdentityRow[]>(Prisma.sql`
    SELECT profile.id, profile.snapshot, profile.employeeNo, profile.account, profile.accountCount,
      (SELECT JSON_OBJECT('employeeNo', ${authority === "iam" || authority === "iam-portal"
          ? Prisma.sql`JSON_EXTRACT(r.payload, '$.account')` : Prisma.sql`JSON_EXTRACT(r.payload, '$.employeeNo')`},
        'organization', JSON_EXTRACT(r.payload, '$.organization'))
       FROM access_records r WHERE r.kind = 'grant' AND r.subjectId = profile.account AND profile.profileStatus = 'active'
         AND r.expiresAt > ${now} AND JSON_EXTRACT(r.payload, '$.active') = true
         AND BINARY JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.account')) = BINARY profile.account
         AND BINARY JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.userId')) = BINARY profile.profileUserId
         AND JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.authority')) = ${authority}
       ORDER BY r.updatedAt DESC, r.id DESC LIMIT 1) AS currentProfile
      , (SELECT JSON_OBJECT('employeeNo', JSON_EXTRACT(a.payload, '$.account'),
          'organization', JSON_EXTRACT(a.payload, '$.organization'))
         FROM access_records a WHERE a.kind = 'iamAccount' AND a.subjectId = profile.account
           AND ${authority} = 'iam' AND a.expiresAt > ${now}
           AND JSON_EXTRACT(a.payload, '$.active') = true AND JSON_EXTRACT(a.payload, '$.deleted') = false
           AND BINARY JSON_UNQUOTE(JSON_EXTRACT(a.payload, '$.account')) = BINARY profile.account
         ORDER BY a.updatedAt DESC, a.id DESC LIMIT 1) AS directoryProfile
    FROM (
      SELECT s.id, s.identity_snapshot_json AS snapshot, u.employee_no AS employeeNo, u.id AS profileUserId, u.status AS profileStatus,
        (SELECT IF(COUNT(*) = 1, MIN(i.provider_user_id), NULL) FROM identity_accounts i
          WHERE i.user_id = u.id AND i.provider = 'lighthouse-portal') AS account,
        (SELECT COUNT(*) FROM identity_accounts i WHERE i.user_id = u.id AND i.provider = 'lighthouse-portal') AS accountCount
      FROM chat_sessions s LEFT JOIN users u ON u.id = s.user_id AND u.user_type = 'internal_employee'
      WHERE s.id IN (${Prisma.join(ids)}) AND s.user_id IS NOT NULL AND s.guest_id IS NULL
    ) profile
  `);
  return new Map(rows.map((row): [string, HermitRecordIdentity] => {
    const snapshot = readIdentitySnapshot(row.snapshot);
    if (snapshot) return [row.id, { employeeNo: snapshot.employeeNo, account: snapshot.account, organization: snapshot.organization, source: "session-snapshot" }];
    const accountCount = Number(row.accountCount);
    if (!Number.isSafeInteger(accountCount) || accountCount < 0 || accountCount > 1) return [row.id, { ...unavailableRecordIdentity }];
    const account = identityText(row.account, 191);
    if (accountCount === 1 && !account) return [row.id, { ...unavailableRecordIdentity }];
    const localNumber = identityText(row.employeeNo, 191);
    if (!account && !localNumber) return [row.id, { ...unavailableRecordIdentity }];
    const current = authority === "iam" ? readCurrentProfile(row.directoryProfile) : readCurrentProfile(row.currentProfile);
    const liveNumber = identityText(current?.employeeNo, 191);
    return [row.id, { employeeNo: liveNumber ?? localNumber, account,
      organization: identityText(current?.organization, 1000), source: "current-profile" }];
  }));
}

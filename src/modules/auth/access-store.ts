import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { AccessError } from "./access-types";

export type AccessPayloads = {
  guest: { namespace: string; userId: string; grantId: string; csrfToken: string };
  login: { verifierHash: string; returnTo: string; consumed: boolean; authority?: "portal" | "iam" | "iam-portal"; entry?: "card" };
  pending: { tokenCipher: string; account: string; displayName: string; csrfToken: string; returnTo: string; consumed: boolean; upstreamExpiresAt: number };
  grant: { userId: string; account: string; displayName: string; organization?: string; tokenCipher: string; active: boolean; identityAt: number; rolesAt: number; roles: string[]; authority?: "portal" | "iam" | "iam-portal" };
  iamAccount: { account: string; displayName: string; organization?: string; active: boolean; deleted: boolean };
  iamPermission: { account: string; role: string; postCode: string; active: boolean; validUntil: number };
  iamDelivery: { endpoint: "account" | "permission" };
  session: { grantId: string; csrfToken: string; active: boolean; lastUsedAt: number };
  device: { name: string; userCodeHash: string; status: "pending" | "approved" | "denied" | "exchanged" | "revoked"; approvedSessionId?: string; grantId?: string; lastPollAt: number; intervalMs: number };
  userCode: { deviceId: string };
  client: { grantId: string; sessionId: string; name: string; active: boolean; currentRefreshHash: string; lastUsedAt: number };
  access: { clientId: string };
  refresh: { clientId: string; used: boolean };
  bucket: { count: number };
  audit: { action: string; account: string; targetId: string };
};
export type AccessKind = keyof AccessPayloads;
export type AccessRecord<K extends AccessKind = AccessKind> = {
  id: string; kind: K; subjectId: string; parentId: string | null;
  payload: AccessPayloads[K]; expiresAt: number; createdAt: number; updatedAt: number;
};
export type EmployeeShadow = { id: string; account: string; displayName: string; active: boolean; employee: boolean; conflicting?: boolean };
type IndexedQuery = { subjectId?: string; parentId?: string; expiresAfter?: number; activeOnly?: boolean };
export interface AccessTransaction {
  get<K extends AccessKind>(kind: K, id: string): Promise<AccessRecord<K> | null>;
  put<K extends AccessKind>(record: AccessRecord<K>): Promise<void>;
  find<K extends AccessKind>(kind: K, query: IndexedQuery): Promise<AccessRecord<K>[]>;
  ensureEmployee(account: string, displayName: string, candidateId: string): Promise<EmployeeShadow>;
  employeeActive(account: string, userId: string): Promise<boolean>;
}
export interface AccessStore {
  transaction<T>(callback: (tx: AccessTransaction) => Promise<T>): Promise<T>;
}
// Stable historical provider+account identity mapping. IAM reuses the same
// trusted account shadow to preserve user IDs/content ownership; this name does
// not select a runtime identity provider or authorize a portal session in IAM.
const PROVIDER = "lighthouse-portal";
const ENUMERATION_LIMIT = 1000;
function eligible(user: EmployeeShadow) {
  if (!user.active || !user.employee || user.conflicting) throw new AccessError("Employee identity mapping is unavailable", 403);
  return user;
}

/** Transactional test store: serializes callers and rolls back the complete write set on errors. */
export class MemoryAccessStore implements AccessStore {
  private records = new Map<string, AccessRecord>();
  private employees = new Map<string, EmployeeShadow>();
  private tail: Promise<void> = Promise.resolve();
  seedEmployee(value: EmployeeShadow) { this.employees.set(value.account, structuredClone(value)); }
  snapshot(): AccessRecord[] { return structuredClone([...this.records.values()]); }
  async transaction<T>(callback: (tx: AccessTransaction) => Promise<T>): Promise<T> {
    const prior = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    const records = structuredClone(this.records), employees = structuredClone(this.employees);
    const tx: AccessTransaction = {
      get: async <K extends AccessKind>(kind: K, id: string) => {
        const record = records.get(id);
        return record?.kind === kind ? structuredClone(record) as AccessRecord<K> : null;
      },
      put: async (record) => { records.set(record.id, structuredClone(record)); },
      find: async <K extends AccessKind>(kind: K, query: IndexedQuery) => {
        if (query.subjectId === undefined && query.parentId === undefined) throw new Error("Indexed query required");
        const found = [...records.values()].filter((row) => row.kind === kind && (query.subjectId === undefined || row.subjectId === query.subjectId) && (query.parentId === undefined || row.parentId === query.parentId) && (query.expiresAfter === undefined || row.expiresAt > query.expiresAfter) && (!query.activeOnly || ("active" in row.payload && row.payload.active)));
        if (found.length > ENUMERATION_LIMIT) throw new AccessError("Too many active authorization records", 503);
        return structuredClone(found) as AccessRecord<K>[];
      },
      ensureEmployee: async (account, displayName, candidateId) => {
        let user = employees.get(account);
        if (!user) { user = { id: candidateId, account, displayName, active: true, employee: true }; employees.set(account, user); }
        return structuredClone(eligible(user));
      },
      employeeActive: async (account, userId) => {
        const user = employees.get(account);
        return !!user && user.id === userId && user.active && user.employee && !user.conflicting;
      },
    };
    try { const result = await callback(tx); this.records = records; this.employees = employees; return result; }
    finally { release(); }
  }
}

type DbRecord = { id: string; kind: string; subjectId: string; parentId: string | null; payload: Prisma.JsonValue; expiresAt: Date; createdAt: Date; updatedAt: Date };
// Structural delegate keeps this additive change compilable before the controller regenerates Prisma.
type RecordDelegate = {
  findUnique(args: { where: { id: string } }): Promise<DbRecord | null>;
  findMany(args: { where: { kind: string; subjectId?: string; parentId?: string; expiresAt?: { gt: Date }; payload?: { path: string; equals: boolean } }; take: number }): Promise<DbRecord[]>;
  upsert(args: { where: { id: string }; create: Omit<DbRecord, "payload"> & { payload: Prisma.InputJsonValue }; update: Omit<DbRecord, "payload"> & { payload: Prisma.InputJsonValue } }): Promise<unknown>;
};
function deserialize<K extends AccessKind>(row: DbRecord): AccessRecord<K> {
  return { ...row, kind: row.kind as K, payload: row.payload as AccessPayloads[K], expiresAt: row.expiresAt.getTime(), createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime() };
}
export class PrismaAccessStore implements AccessStore {
  constructor(private readonly prisma: PrismaClient) {}
  async transaction<T>(callback: (tx: AccessTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (db) => {
          const records = (db as unknown as { accessRecord: RecordDelegate }).accessRecord;
          const mapping = (account: string) => db.identityAccount.findUnique({ where: { provider_providerUserId: { provider: PROVIDER, providerUserId: account } }, include: { user: { include: { identityAccounts: { where: { provider: PROVIDER } } } } } });
          const tx: AccessTransaction = {
            get: async <K extends AccessKind>(kind: K, id: string) => { const row = await records.findUnique({ where: { id } }); return row?.kind === kind ? deserialize<K>(row) : null; },
            put: async (record) => {
              const data = { ...record, payload: record.payload as Prisma.InputJsonValue, expiresAt: new Date(record.expiresAt), createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt) };
              await records.upsert({ where: { id: record.id }, create: data, update: data });
            },
            find: async <K extends AccessKind>(kind: K, query: IndexedQuery) => {
              if (query.subjectId === undefined && query.parentId === undefined) throw new Error("Indexed query required");
              const { expiresAfter, activeOnly, ...index } = query;
              const rows = await records.findMany({ where: { kind, ...index, ...(expiresAfter === undefined ? {} : { expiresAt: { gt: new Date(expiresAfter) } }), ...(activeOnly ? { payload: { path: "$.active", equals: true } } : {}) }, take: ENUMERATION_LIMIT + 1 });
              if (rows.length > ENUMERATION_LIMIT) throw new AccessError("Too many authorization records", 503);
              return rows.map((row) => deserialize<K>(row));
            },
            ensureEmployee: async (account, displayName, candidateId) => {
              const found = await mapping(account);
              if (found) return eligible({ id: found.userId, account, displayName: found.user.displayName, active: found.user.status === "ACTIVE", employee: found.user.userType === "INTERNAL_EMPLOYEE", conflicting: found.provider !== PROVIDER || found.providerUserId !== account || found.user.identityAccounts.some((identity) => identity.providerUserId !== account) });
              // A new trusted account gets a new shadow. Never search employeeNo/email/demo users.
              const user = await db.user.create({ data: { id: candidateId, displayName, userType: "INTERNAL_EMPLOYEE", status: "ACTIVE", identityAccounts: { create: { id: randomUUID(), provider: PROVIDER, providerUserId: account } } } });
              return { id: user.id, account, displayName: user.displayName, active: true, employee: true };
            },
            employeeActive: async (account, userId) => {
              const found = await mapping(account);
              return !!found && found.userId === userId && found.provider === PROVIDER && found.providerUserId === account && found.user.status === "ACTIVE" && found.user.userType === "INTERNAL_EMPLOYEE" && found.user.identityAccounts.every((identity) => identity.providerUserId === account);
            },
          };
          return callback(tx);
        }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        // P2002 may be the winning concurrent provider-account insertion; retry sees its mapping.
        if ((code !== "P2034" && code !== "P2002") || attempt >= 3) throw error;
      }
    }
  }
}

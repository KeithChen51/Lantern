import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";
import { identityText, readIdentitySnapshot, readRecordIdentities } from "./record-identity";

const query = vi.fn();
const options = { database: { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">,
  now: new Date("2026-11-02T08:00:00.000Z"), authority: "iam-portal" as const };
const missing = { employeeNo: null, account: null, organization: null, source: "unavailable" };

beforeEach(() => { query.mockReset(); });

describe("administrator conversation identity", () => {
  it("keeps the captured identity instead of replacing it with a later profile", async () => {
    query.mockResolvedValue([{ id: "snapshot", snapshot: { version: 1, employeeNo: "000042", account: "000042", organization: "原组织 / 文化部" },
      employeeNo: "changed", account: "changed", currentProfile: { employeeNo: "changed", organization: "新组织" } }]);
    expect((await readRecordIdentities(["snapshot"], options)).get("snapshot")).toEqual({ employeeNo: "000042", account: "000042", organization: "原组织 / 文化部", source: "session-snapshot" });
  });

  it("preserves missing captured fields and never backfills them from the current directory", async () => {
    query.mockResolvedValue([{ id: "snapshot", snapshot: JSON.stringify({ version: 1, employeeNo: null, account: "login.only", organization: null }),
      employeeNo: "new-number", account: "login.only", currentProfile: { organization: "later organization" } }]);
    expect((await readRecordIdentities(["snapshot"], options)).get("snapshot")).toEqual({ employeeNo: null, account: "login.only", organization: null, source: "session-snapshot" });
  });

  it("labels an older session's current trusted profile and keeps the login account separate from a real employee number", async () => {
    query.mockResolvedValue([{ id: "legacy", snapshot: null, employeeNo: "E134001", account: "login.employee", accountCount: 1,
      currentProfile: JSON.stringify({ employeeNo: null, organization: "服务中心 / 华东售后部" }) }]);
    expect((await readRecordIdentities(["legacy"], options)).get("legacy")).toEqual({ employeeNo: "E134001", account: "login.employee", organization: "服务中心 / 华东售后部", source: "current-profile" });
    const sql = query.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("i.provider = 'lighthouse-portal'");
    expect(sql.sql).toContain("IF(COUNT(*) = 1, MIN(i.provider_user_id), NULL)");
    expect(sql.sql).toContain("u.user_type = 'internal_employee'");
    expect(sql.sql).toContain("profile.profileStatus = 'active'");
    expect(sql.sql).toContain("r.expiresAt > ?");
    expect(sql.sql).toContain("JSON_EXTRACT(r.payload, '$.active') = true");
    expect(sql.sql).toContain("'$.account')) = BINARY profile.account");
    expect(sql.sql).toContain("'$.userId')) = BINARY profile.profileUserId");
    expect(sql.sql).toContain("'$.authority')) = ?");
    expect(sql.sql).not.toMatch(/SELECT\s+(?:r\.)?payload\b/i);
    expect(sql.sql).not.toMatch(/tokenCipher|raw_profile_json|mobile|email/i);
    expect(sql.values).toEqual([options.now, "iam-portal", "iam-portal", options.now, "legacy"]);
  });

  it("uses a documented authenticated employee number over a conflicting older local field", async () => {
    query.mockResolvedValue([{ id: "legacy", snapshot: null, employeeNo: "old-local-number", account: "000042", accountCount: 1,
      currentProfile: { employeeNo: "000042", organization: "当前可信组织" } }]);
    expect((await readRecordIdentities(["legacy"], options)).get("legacy")).toEqual({ employeeNo: "000042", account: "000042", organization: "当前可信组织", source: "current-profile" });
    expect((query.mock.calls[0][0] as Prisma.Sql).sql).toContain("JSON_EXTRACT(r.payload, '$.account')");
    expect((query.mock.calls[0][0] as Prisma.Sql).sql).not.toContain("CASE WHEN");
  });

  it("keeps portal organization available when its grant has no explicit employee number", async () => {
    query.mockResolvedValue([{ id: "legacy", snapshot: null, employeeNo: "E134001", account: "login.employee", accountCount: 1,
      currentProfile: { employeeNo: null, organization: "服务中心 / 售后部" } }]);
    expect((await readRecordIdentities(["legacy"], { ...options, authority: "portal" })).get("legacy"))
      .toEqual({ employeeNo: "E134001", account: "login.employee", organization: "服务中心 / 售后部", source: "current-profile" });
    const sql = query.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("JSON_OBJECT('employeeNo', JSON_EXTRACT(r.payload, '$.employeeNo')");
    expect(sql.sql).not.toContain("CASE WHEN");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("keeps missing profile fields missing and refuses an ambiguous or removed account association", async () => {
    query.mockResolvedValue([
      { id: "unknown-number", snapshot: null, employeeNo: null, account: "login.only", accountCount: 1, currentProfile: null },
      { id: "ambiguous", snapshot: null, employeeNo: "E134001", account: null, accountCount: 2, currentProfile: { organization: "unrelated" } },
    ]);
    const identities = await readRecordIdentities(["unknown-number", "ambiguous"], options);
    expect(identities.get("unknown-number")).toEqual({ employeeNo: null, account: "login.only", organization: null, source: "current-profile" });
    expect(identities.get("ambiguous")).toEqual(missing);
  });

  it("can identify an existing local employee number without an auth-cache or account mapping", async () => {
    query.mockResolvedValue([{ id: "local", snapshot: null, employeeNo: "E134001", account: null, accountCount: 0,
      currentProfile: null, directoryProfile: null }]);
    expect((await readRecordIdentities(["local"], options)).get("local")).toEqual({
      employeeNo: "E134001", account: null, organization: null, source: "current-profile",
    });
  });

  it("uses an active IAM directory after logout without taking organization from an old grant", async () => {
    query.mockResolvedValue([{ id: "logged-out", snapshot: null, employeeNo: null, account: "000042", accountCount: 1,
      currentProfile: { organization: "旧缓存组织" }, directoryProfile: { employeeNo: "000042", organization: "当前同步组织 / 服务部" } }]);
    expect((await readRecordIdentities(["logged-out"], { ...options, authority: "iam" })).get("logged-out")).toEqual({
      employeeNo: "000042", account: "000042", organization: "当前同步组织 / 服务部", source: "current-profile",
    });
    const sql = query.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("a.kind = 'iamAccount' AND a.subjectId = profile.account");
    expect(sql.sql).toContain("JSON_EXTRACT(a.payload, '$.active') = true");
    expect(sql.sql).toContain("JSON_EXTRACT(a.payload, '$.deleted') = false");
    expect(sql.sql).toContain("'$.account')) = BINARY profile.account");
    expect(sql.sql).toContain("AND ? = 'iam' AND a.expiresAt > ?");
  });

  it("keeps an explicitly absent IAM organization absent instead of borrowing stale grant fields", async () => {
    query.mockResolvedValue([{ id: "directory", snapshot: null, employeeNo: null, account: "000042", accountCount: 1,
      currentProfile: { organization: "旧组织" }, directoryProfile: { employeeNo: "000042", organization: null } }]);
    expect((await readRecordIdentities(["directory"], { ...options, authority: "iam" })).get("directory"))
      .toEqual({ employeeNo: "000042", account: "000042", organization: null, source: "current-profile" });
  });

  it("does not query identities when the page contains no employee conversations", async () => {
    expect(await readRecordIdentities([], options)).toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });

  it("restricts snapshots to the supported small display fields and keeps malformed values out", () => {
    expect(readIdentitySnapshot({ version: 1, employeeNo: " 000042 ", account: "login.employee", organization: "组织\nraw-secret", extra: "token" }))
      .toEqual({ version: 1, employeeNo: "000042", account: "login.employee", organization: null });
    for (const value of ["invalid-json", { version: 2 }, [], null]) expect(readIdentitySnapshot(value)).toBeNull();
    expect(identityText("x".repeat(1001), 1000)).toBeNull();
  });
});

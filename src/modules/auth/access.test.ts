import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "./access-types";

const { webPrincipal, clientPrincipal } = vi.hoisted(() => ({ webPrincipal: vi.fn(), clientPrincipal: vi.fn() }));
vi.mock("@/infrastructure/db", () => ({ prisma: {} }));
vi.mock("./access-config", () => ({ readAccessConfig: () => ({ origin: "https://app.example.invalid", sessionCookie: "__Host-lighthouse_session" }) }));
vi.mock("./access-service", () => ({ AccessService: class { webPrincipal = webPrincipal; clientPrincipal = clientPrincipal; } }));
vi.mock("./access-store", () => ({ PrismaAccessStore: class {} }));
vi.mock("./portal", () => ({ HttpPortalAdapter: class {} }));
import { assertWebMutation, authErrorResponse, readAccessCookie, requireEmployee, requireKnowledgeAdmin, requireKnowledgeClient } from "./access";

const opaque = "a".repeat(43);
const principal: Principal = { userId: "employee", account: "000123", displayName: "Fixture", grantId: "grant", credentialId: "session", channel: "web", capabilities: ["knowledge:read"], csrfToken: "csrf-nonce", expiresAt: Date.now() + 1000 };
function request(extra: Record<string, string> = {}) {
  return new Request("https://app.example.invalid/api/resources", { headers: { cookie: `__Host-lighthouse_session=${opaque}`, ...extra } });
}
beforeEach(() => { vi.resetAllMocks(); webPrincipal.mockResolvedValue(principal); clientPrincipal.mockResolvedValue({ ...principal, channel: "cli" }); });

describe("transport authentication boundary", () => {
  it("accepts exactly one correctly formed host session cookie", async () => {
    expect(await requireEmployee(request())).toEqual(principal);
    expect(webPrincipal).toHaveBeenCalledWith(opaque);
    for (const cookie of [`__Host-lighthouse_session=${opaque}; __Host-lighthouse_session=${opaque}`, "__Host-lighthouse_session=short", "__Host-lighthouse_session=%61".repeat(40)]) {
      expect(readAccessCookie(new Headers({ cookie }), "__Host-lighthouse_session")).toBeUndefined();
    }
  });
  it("never promotes tool bearer credentials to a web session", async () => {
    await expect(requireEmployee(new Request("https://app.example.invalid/heart", { headers: { authorization: `Bearer ${opaque}` } }))).rejects.toMatchObject({ status: 401 });
    expect(webPrincipal).not.toHaveBeenCalled();
  });
  it("never accepts browser cookies or malformed bearer schemes for the client API", async () => {
    for (const authorization of ["", "Basic " + opaque, "Bearer short", "Bearer " + opaque + ", other"]) {
      await expect(requireKnowledgeClient(request({ authorization }))).rejects.toMatchObject({ status: 401 });
    }
    expect(clientPrincipal).not.toHaveBeenCalled();
    await requireKnowledgeClient(request({ authorization: `Bearer ${opaque}` }));
    expect(clientPrincipal).toHaveBeenCalledWith(opaque);
  });
  it("requires the exact knowledge management capability and refreshes it for writes", async () => {
    await expect(requireKnowledgeAdmin(request())).rejects.toMatchObject({ status: 403 });
    webPrincipal.mockResolvedValue({ ...principal, capabilities: ["knowledge:manage"] });
    const write = request({ origin: "https://app.example.invalid", "x-csrf-token": "csrf-nonce" });
    await requireKnowledgeAdmin(write, { write: true });
    expect(webPrincipal).toHaveBeenLastCalledWith(opaque, { adminWrite: true });
    await expect(requireKnowledgeAdmin(request(), { write: true })).rejects.toMatchObject({ status: 403 });
  });
  it.each<Record<string, string>>([
    {},
    { origin: "https://hostile.invalid", "x-csrf-token": "csrf-nonce" },
    { origin: "https://app.example.invalid", "x-csrf-token": "wrong" },
    { origin: "https://app.example.invalid", "x-csrf-token": "csrf-nonce", "sec-fetch-site": "cross-site" },
  ])("rejects missing or mismatched mutation proof %j", headers => {
    expect(() => assertWebMutation(request(headers), principal)).toThrow();
  });
  it("binds CSRF to a web principal even with the correct origin and nonce", () => {
    const valid = request({ origin: "https://app.example.invalid", "x-csrf-token": "csrf-nonce" });
    expect(() => assertWebMutation(valid, principal)).not.toThrow();
    expect(() => assertWebMutation(valid, { ...principal, channel: "mcp" })).toThrow();
  });
  it("conceals unexpected internal errors and disables response caching", async () => {
    const response = authErrorResponse(new Error("private connection string"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("private connection string");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError, type Principal } from "@/modules/auth/access-types";
import { POST } from "./route";

const { employee } = vi.hoisted(() => ({ employee: vi.fn() }));
vi.mock("@/modules/auth/access", async importOriginal => ({ ...await importOriginal<typeof import("@/modules/auth/access")>(), requireEmployee: employee }));
const principal: Principal = { kind: "employee", userId: "local-employee", account: "000042", displayName: "员工", grantId: "grant", credentialId: "credential", channel: "web", capabilities: ["content:read"], csrfToken: "synthetic-csrf", expiresAt: 2100000000000 };
const env = {
  NODE_ENV: "test", AUTH_MODE: "iam", IAM_AUTHORIZATION_SOURCE: "portal", LIGHTHOUSE_DEPLOYMENT_ENV: "test", LIGHTHOUSE_ORIGIN: "https://lighthouse.example.invalid", AUTH_TEST_HTTP_ORIGIN: "", AUTH_ALLOW_LOCAL_HTTP: "false",
  IAM_BASE_URL: "https://iam.example.invalid", IAM_CLIENT_ID: "synthetic-client", IAM_CLIENT_SECRET: "synthetic-iam-secret", AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  PORTAL_API_BASE_URL: "https://portal.example.invalid/api", PORTAL_API_HTTP_ORIGIN: "", PORTAL_APP_CODE: "lighthouse", PORTAL_APP_SECRET: "synthetic-portal-secret",
  WATERMARK_ENABLE: "true", WATERMARK_BASE_URL: "https://watermark-common.example.invalid", WATERMARK_API_KEY: "synthetic-tenant-secret", WATERMARK_SDK_URL: "",
};
function request(body: unknown = {}, extra: Record<string, string> = {}) {
  return new Request(`${env.LIGHTHOUSE_ORIGIN}/api/watermark/web/communicate`, { method: "POST", headers: { Origin: env.LIGHTHOUSE_ORIGIN, "x-csrf-token": principal.csrfToken!, "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) });
}
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  employee.mockResolvedValue(principal);
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 0, data: { wmInfo: "synthetic-data", wmOpacity: 5 } }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("authenticated web watermark endpoint", () => {
  it("overrides spoofed identity/template/target with the trusted employee account", async () => {
    const response = await POST(request({ objectId: "another-person", objectType: 3, invisibleModuleId: 999, baseUrl: "https://attacker.invalid", apiKey: "attacker-key" }));
    expect(response.status).toBe(200);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ objectId: "000042", objectType: 1 });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(await response.json()).toEqual({ data: { wmInfo: "synthetic-data", wmOpacity: 5 }, owner: { userId: principal.userId, account: principal.account }, expiresAt: principal.expiresAt });
  });

  it.each([401, 403] as const)("rejects unauthenticated/guest access (%s) before contacting the public service", async status => {
    employee.mockRejectedValue(new AccessError("Denied", status));
    expect((await POST(request())).status).toBe(status);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{ Origin: "https://attacker.invalid" }, { "x-csrf-token": "forged" }, { "sec-fetch-site": "cross-site" }])("uses the real app origin/CSRF guard: %j", async extra => {
    expect((await POST(request({}, extra))).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never sends a request while the feature is disabled", async () => {
    vi.stubEnv("WATERMARK_ENABLE", "false");
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "watermark_disabled" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("isolates per-user responses without a shared cache", async () => {
    await POST(request());
    employee.mockResolvedValue({ ...principal, userId: "second-user", account: "000043" });
    fetcher.mockResolvedValue(Response.json({ code: 0, data: { wmInfo: "second-data", wmOpacity: 5 } }));
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ owner: { userId: "second-user", account: "000043" }, data: { wmInfo: "second-data" } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).objectId).toBe("000043");
  });

  it("does not send or return watermark data after the verified session expires", async () => {
    employee.mockResolvedValue({ ...principal, expiresAt: Date.now() - 1 });
    expect((await POST(request())).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();

    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    employee.mockResolvedValue({ ...principal, expiresAt: now + 100 });
    fetcher.mockImplementation(async () => {
      clock.mockReturnValue(now + 200);
      return Response.json({ code: 0, data: { wmInfo: "expired-data", wmOpacity: 5 } });
    });
    try {
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("expired-data");
    } finally { clock.mockRestore(); }
  });

  it("sanitizes supplier auth errors without returning an app 401 or credentials", async () => {
    fetcher.mockResolvedValue(new Response(`tenant secret ${env.WATERMARK_API_KEY}`, { status: 401 }));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(JSON.stringify({ error: { code: "watermark_unavailable", message: "网页水印服务暂不可用，请稍后重试。" } }));
  });
});

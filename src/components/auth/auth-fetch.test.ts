import { afterEach, describe, expect, it, vi } from "vitest";
import { authFetch, AuthRequestError, registerBrowserSession, type WebSession } from "./auth-fetch";

let releaseSession: (() => void) | undefined;
afterEach(() => { releaseSession?.(); releaseSession = undefined; vi.unstubAllGlobals(); });
const guestSession: WebSession = { kind: "guest", user: { id: "guest-one", account: "", displayName: "访客" }, capabilities: ["hermit:chat"], csrfToken: "guest-csrf", expiresAt: 1900000000000 };

function browserLocation() {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { origin: "https://lighthouse.example", pathname: "/hermit", search: "?question=one", assign } });
  return assign;
}
describe("employee browser API transport", () => {
  it("adds current CSRF to multipart and JSON mutations without changing their body", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ csrfToken: "safe-current-token" })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    const body = new FormData(); body.append("file", "contents");
    await authFetch("/api/hermit/attachments", { method: "POST", body });
    expect(request).toHaveBeenNthCalledWith(1, "/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    const [, init] = request.mock.calls[1];
    expect(init.body).toBe(body); expect(init.headers.get("x-csrf-token")).toBe("safe-current-token"); expect(init.credentials).toBe("same-origin");
  });
  it("never forwards CSRF or cookie to external origins or non-API requests", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await expect(authFetch("https://outside.invalid/api/chat", { method: "POST" })).rejects.toThrow("本站接口");
    await expect(authFetch("/heart", { method: "POST" })).rejects.toThrow("本站接口");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([401, 403, 503])("surfaces HTTP %s before starting a mutation", async status => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status })); vi.stubGlobal("fetch", request);
    await expect(authFetch("/api/chat", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(AuthRequestError);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("reads protected knowledge without requiring a CSRF token", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ id: "resource" })); vi.stubGlobal("fetch", request);
    await authFetch("/api/resources/resource"); expect(request).toHaveBeenCalledTimes(1);
  });

  it("uses the current guest CSRF for a mutation with the same anonymous owner", async () => {
    releaseSession = registerBrowserSession(guestSession);
    const request = vi.fn().mockResolvedValueOnce(Response.json({ ...guestSession, csrfToken: "guest-current-csrf" })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    await authFetch("/api/chat", { method: "POST", body: "{}" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].headers.get("x-csrf-token")).toBe("guest-current-csrf");
  });

  it("recovers expired guests at home without entering employee login or replaying a write", async () => {
    releaseSession = registerBrowserSession(guestSession);
    const assign = browserLocation();
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", request);
    await expect(authFetch("/api/chat", { method: "POST", body: "{}" })).rejects.toThrow("访客会话");
    expect(assign).toHaveBeenCalledWith("/");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves employee login recovery with the original page return path", async () => {
    releaseSession = registerBrowserSession({ ...guestSession, kind: "employee", user: { id: "employee", account: "001", displayName: "测试员工" } });
    const assign = browserLocation();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(authFetch("/api/resources/one")).rejects.toBeInstanceOf(AuthRequestError);
    expect(assign).toHaveBeenCalledWith("/login?returnTo=%2Fhermit%3Fquestion%3Done");
  });

  it.each([
    { ...guestSession, user: { ...guestSession.user, id: "guest-two" } },
    { ...guestSession, kind: "employee" as const },
  ])("blocks writes when the cookie now belongs to another identity", async replacement => {
    releaseSession = registerBrowserSession(guestSession);
    const assign = browserLocation();
    const request = vi.fn().mockResolvedValue(Response.json(replacement));
    vi.stubGlobal("fetch", request);
    await expect(authFetch("/api/hermit/attachments", { method: "POST", body: "attachment" })).rejects.toBeInstanceOf(AuthRequestError);
    expect(assign).toHaveBeenCalledWith("/");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not retry an already-started guest mutation after HTTP 401", async () => {
    releaseSession = registerBrowserSession(guestSession);
    const assign = browserLocation();
    const request = vi.fn().mockResolvedValueOnce(Response.json(guestSession)).mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", request);
    await expect(authFetch("/api/chat", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(AuthRequestError);
    expect(request).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("blocks a pending mutation if the rendered identity changes during session refresh", async () => {
    releaseSession = registerBrowserSession(guestSession);
    const assign = browserLocation();
    let resolveSession!: (response: Response) => void;
    const request = vi.fn().mockReturnValue(new Promise<Response>(resolve => { resolveSession = resolve; }));
    vi.stubGlobal("fetch", request);
    const result = authFetch("/api/chat", { method: "POST", body: "{}" });
    releaseSession();
    releaseSession = registerBrowserSession({ ...guestSession, user: { ...guestSession.user, id: "guest-two" } });
    resolveSession(Response.json(guestSession));
    await expect(result).rejects.toBeInstanceOf(AuthRequestError);
    expect(request).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { authFetch, AuthRequestError } from "./auth-fetch";

afterEach(() => vi.unstubAllGlobals());
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
});

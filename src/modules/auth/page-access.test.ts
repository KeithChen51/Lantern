import { describe, expect, it } from "vitest";
import { classifyAccessPath, normalizeAccessPath, safeReturnTo } from "./page-access";

describe("employee page and asset access", () => {
  it("opens only employee entry pages and explicit brand assets", () => {
    for (const path of ["/login", "/auth/confirm", "/auth/portal/callback", "/admin/login", "/nav-lighthouse-transparent.png", "/fonts/brand/smiley-sans/SmileySans-Oblique.woff2", "/_next/static/chunks/a.css"]) expect(classifyAccessPath(path)).toBe("public");
    expect(classifyAccessPath("/_next/image", "/nav-lighthouse-transparent.png")).toBe("public");
  });
  it("protects business pages, HTML/PDF/image originals, RSC and all JS", () => {
    for (const path of ["/", "/heart", "/mirror", "/action/driver-partner-rest-area", "/resources/id", "/admin/knowledge", "/auth/device", "/auth/tools"]) expect(classifyAccessPath(path)).toBe("page");
    for (const path of ["/_next/static/chunks/runtime.js", "/_next/data/build/heart.json", "/_next/image", "/files/whitepaper.pdf", "/files/business.html", "/images/games/service-store.webp"]) expect(classifyAccessPath(path)).toBe("asset");
    expect(classifyAccessPath("/_next/image", "https://outside.invalid/public.png")).toBe("asset");
    expect(classifyAccessPath("/_next/image", "/%6eav-lighthouse-transparent.png")).toBe("asset");
  });
  it("leaves bearer and cookie APIs to their own guards", () => {
    expect(classifyAccessPath("/api/client/v1/resources")).toBe("api");
    expect(classifyAccessPath("/api/auth/token")).toBe("api");
    expect(classifyAccessPath("/api/chat")).toBe("api");
  });
  it.each(["//login", "/login//", "/login/../heart", "/login/%2e%2e/heart", "/login%2f..%2fheart", "/login%252f..%252fheart", "/login\\..\\heart", "/login%5c..%5cheart", "/login%00", "/login?foo", "/bad%zz"])("rejects ambiguous path %s", path => { expect(normalizeAccessPath(path)).toBeNull(); });
  it("keeps a direct internal deep link and rejects return-url redirects", () => {
    expect(safeReturnTo("/resources/notice?version=v1")).toBe("/resources/notice?version=v1");
    expect(safeReturnTo("/auth/device?user_code=ABCD-EFGH")).toBe("/auth/device?user_code=ABCD-EFGH");
    for (const path of ["https://outside.invalid", "//outside.invalid", "/%2foutside.invalid", "/login", "/auth/confirm", "/api/auth/token", "/_next/static/chunks/a.js", "/heart#token"]) expect(safeReturnTo(path)).toBe("/");
  });
});

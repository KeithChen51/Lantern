// Keep the public entry points small: no business JavaScript is public.
export const REQUEST_PATH_HEADER = "x-lighthouse-request-path";
const PUBLIC_PAGES = new Set(["/login", "/auth/confirm", "/auth/portal/callback", "/admin/login"]);
const PUBLIC_ASSETS = new Set([
  "/nav-lighthouse-transparent.png", "/favicon.ico", "/icon.png", "/apple-icon.png",
  "/fonts/brand/source-han-serif-sc/SourceHanSerifSC-VF.otf.woff2",
  "/fonts/brand/source-han-sans-cn/SourceHanSansCN-Regular.otf",
  "/fonts/brand/source-han-sans-cn/SourceHanSansCN-Medium.otf",
  "/fonts/brand/source-han-sans-cn/SourceHanSansCN-Bold.otf",
  "/fonts/brand/smiley-sans/SmileySans-Oblique.woff2",
]);

export function normalizeAccessPath(path: string): string | null {
  let value = path;
  try {
    // Reject encoded delimiters and dot segments instead of allowing a public
    // spelling to resolve to a protected route further down the request chain.
    for (let depth = 0; depth < 5; depth++) {
      if (/[\\\x00-\x1f?#]/.test(value) || /%2f|%5c/i.test(value)) return null;
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
      if (depth === 4) return null;
    }
  } catch { return null; }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("//")) return null;
  if (value.split("/").some((part) => part === "." || part === "..")) return null;
  return value.length > 1 ? value.replace(/\/$/, "") : value;
}

export function isPublicAuthPage(path: string): boolean { return PUBLIC_PAGES.has(path); }
export function isPublicBrandAsset(path: string): boolean { return PUBLIC_ASSETS.has(path); }

export function classifyAccessPath(path: string, imageOriginal?: string | null): "invalid" | "public" | "api" | "asset" | "page" {
  const normalized = normalizeAccessPath(path);
  if (normalized === null) return "invalid";
  if (isPublicAuthPage(normalized) || isPublicBrandAsset(normalized)) return "public";
  if (/^\/_next\/static\/[a-zA-Z0-9_./-]+\.css$/.test(normalized)) return "public";
  if (normalized === "/_next/image" && imageOriginal && isPublicBrandAsset(imageOriginal)) return "public";
  if (normalized === "/api" || normalized.startsWith("/api/")) return "api";
  if (normalized.startsWith("/_next/") || /\.[^/]+$/.test(normalized)) return "asset";
  return "page";
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "/";
  const [pathname] = value.split("?");
  const normalized = normalizeAccessPath(pathname);
  if (!normalized || isPublicAuthPage(normalized) || normalized.startsWith("/api/") || normalized.startsWith("/_next/")) return "/";
  return value.includes("#") ? "/" : value;
}

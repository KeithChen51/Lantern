const readingOrigin = "https://lighthouse.invalid";
const allowedLists = new Set(["/action", "/search"]);

/** Only list pages can be reading return targets; never accept an arbitrary URL. */
export function safeReadingReturn(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, readingOrigin);
    if (url.origin !== readingOrigin || !allowedLists.has(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch { return null; }
}

export function readingEntryId(id: string): string { return `resource-${encodeURIComponent(id)}`; }
export function safeReadingAnchor(value: unknown): string | null {
  return typeof value === "string" && /^resource-[\w%.~-]{1,600}$/.test(value) ? value : null;
}
export function readingListPath(pathname: "/action" | "/search", params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  return `${pathname}${query.size ? `?${query}` : ""}`;
}
export function resourceReadingHref(href: string, returnTo: string, anchor: string): string {
  const url = new URL(href, readingOrigin);
  const target = safeReadingReturn(returnTo);
  if (!target || url.origin !== readingOrigin) return href;
  url.searchParams.set("returnTo", target);
  url.searchParams.set("returnAnchor", anchor);
  return `${url.pathname}${url.search}${url.hash}`;
}

export const readingPositionKey = (returnTo: string) => `lighthouse:reading-position:v1:${returnTo}`;
export type ReadingPosition = { y: number; anchor: string; savedAt: number };
export function parseReadingPosition(value: string | null, now = Date.now()): ReadingPosition | null {
  try {
    const position = JSON.parse(value ?? "null") as ReadingPosition | null;
    return position && Number.isFinite(position.y) && position.y >= 0 && position.y < 1e7 && safeReadingAnchor(position.anchor) && Number.isFinite(position.savedAt) && now - position.savedAt >= 0 && now - position.savedAt < 30 * 60_000 ? position : null;
  } catch { return null; }
}

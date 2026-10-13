import { AppError } from "@/shared/errors";
// Import-compatible tombstones. Passwords and legacy cookies confer no rights.
export const ADMIN_PORTAL_COOKIE = "lighthouse_admin_session";
export const ADMIN_PORTAL_TTL_SECONDS = 0;
export function verifyAdminPortalPassword(input: string): boolean { void input; return false; }
export function createAdminPortalSessionCookieValue(now = new Date()): never {
  void now; throw new AppError("forbidden", "Shared-password administration has been retired.", 403);
}
export function verifyAdminPortalSessionCookieValue(value: string | null | undefined, now = new Date()): boolean {
  void value; void now; return false;
}
export function isAdminPortalCookieHeaderAuthorized(value: string | null | undefined, now = new Date()): boolean {
  void value; void now; return false;
}

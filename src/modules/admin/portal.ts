import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "@/shared/errors";

export const ADMIN_PORTAL_COOKIE = "lighthouse_admin_session";
export const ADMIN_PORTAL_TTL_SECONDS = 60 * 60 * 24;

type AdminPortalPayload = {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getPassword() {
  const password = process.env.ADMIN_PORTAL_PASSWORD?.trim();
  if (!password) {
    throw new AppError("bad_request", "Admin portal password is not configured.", 503);
  }
  return password;
}

function getSecret() {
  return process.env.ADMIN_PORTAL_COOKIE_SECRET?.trim() || getPassword();
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyAdminPortalPassword(input: string) {
  const expected = getPassword();
  return safeEqual(input, expected);
}

export function createAdminPortalSessionCookieValue(now = new Date()) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: AdminPortalPayload = {
    v: 1,
    iat: issuedAt,
    exp: issuedAt + ADMIN_PORTAL_TTL_SECONDS,
    nonce: randomBytes(12).toString("base64url"),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyAdminPortalSessionCookieValue(value: string | null | undefined, now = new Date()) {
  if (!value) return false;
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return false;
  if (!safeEqual(sign(encodedPayload), signature)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<AdminPortalPayload>;
    if (payload.v !== 1 || typeof payload.exp !== "number") return false;
    return payload.exp > Math.floor(now.getTime() / 1000);
  } catch {
    return false;
  }
}

export function readCookieFromHeader(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== name) continue;
    const value = rawValue.join("=");
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

export function isAdminPortalCookieHeaderAuthorized(cookieHeader: string | null | undefined, now = new Date()) {
  return verifyAdminPortalSessionCookieValue(readCookieFromHeader(cookieHeader, ADMIN_PORTAL_COOKIE), now);
}

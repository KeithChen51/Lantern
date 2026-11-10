import { createHmac } from "node:crypto";
import { equalSecret } from "./access-crypto";
import type { AccessConfig } from "./access-types";

export const LOGIN_ARRIVAL_HEADER = "x-lighthouse-login-arrival";
export const LOGIN_ARRIVAL_MAX_AGE = 90;
export const loginArrivalCookie = (sessionCookie: string) => `${sessionCookie}_arrival`;

type ArrivalConfig = Pick<AccessConfig, "origin" | "encryptionKey">;

/** The marker carries no identity or bearer credential and is bound to one destination. */
export function createLoginArrival(config: ArrivalConfig, sessionToken: string, returnTo: string, now = Date.now()): string {
  const issuedAt = String(now);
  const signature = createHmac("sha256", Buffer.from(config.encryptionKey, "base64"))
    .update(JSON.stringify(["lighthouse:login-arrival:v1", config.origin, sessionToken, returnTo, issuedAt]))
    .digest("base64url");
  return `${issuedAt}.${signature}`;
}

export function validLoginArrival(config: ArrivalConfig, marker: string, sessionToken: string | undefined, returnTo: string, now = Date.now()): boolean {
  if (!sessionToken || !/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(marker)) return false;
  const issuedAt = Number(marker.split(".")[0]);
  if (issuedAt > now || now - issuedAt > LOGIN_ARRIVAL_MAX_AGE * 1000) return false;
  return equalSecret(marker, createLoginArrival(config, sessionToken, returnTo, issuedAt));
}

/** Ignore flight and prefetch requests so they cannot consume the visual arrival. */
export function isLoginDocument(request: Request): boolean {
  const headers = request.headers;
  return request.method === "GET"
    && !headers.has("rsc")
    && !headers.has("next-router-prefetch")
    && !headers.has("next-router-segment-prefetch")
    && !/prefetch/i.test(`${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`)
    && !new URL(request.url).searchParams.has("_rsc")
    && (headers.get("sec-fetch-dest") === "document" || (headers.get("accept") ?? "").includes("text/html"));
}

import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/infrastructure/db";
import { getAccessService, readAccessCookie } from "./access";
import { readAccessConfig } from "./access-config";
import { equalSecret } from "./access-crypto";
import { NO_STORE, json, route, setCookie } from "./access-http";
import { PrismaAccessStore } from "./access-store";
import { AccessError } from "./access-types";
import { createLoginArrival, loginArrivalCookie, LOGIN_ARRIVAL_MAX_AGE } from "./login-arrival";
import { readWecomGroupConfig, WECOM_GROUP_CALLBACK } from "./wecom-group-config";
import { WecomGroupLogin } from "./wecom-group-login";
import { WecomTicketClient } from "./wecom-ticket-client";

const PROBE_RESULT_SECONDS = 60;

function groupRuntime() {
  const site = readAccessConfig();
  const config = readWecomGroupConfig(site);
  if (!config) throw new AccessError("此环境未启用集团企微登录。", 401);
  return {
    site, config,
    login: new WecomGroupLogin(config, new WecomTicketClient(config), new PrismaAccessStore(prisma)),
    resultCookie: `${config.transactionCookie}_result`,
  };
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: location } });
}

function signedProbeResult(encryptionKey: string, namespace: string, issuedAt: number): string {
  const signature = createHmac("sha256", Buffer.from(encryptionKey, "base64"))
    .update(JSON.stringify(["wecom-group:probe-result:v1", namespace, issuedAt])).digest("base64url");
  return `${issuedAt}.${signature}`;
}

export const wecomGroupStart = route(async request => {
  const { config, login, resultCookie } = groupRuntime();
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(name => name !== "returnTo") || params.getAll("returnTo").length > 1) {
    throw new AccessError("集团企微登录参数无效。", 400);
  }
  const result = await login.startLogin(params.get("returnTo") ?? undefined);
  const response = redirect(result.redirectUrl);
  setCookie(response, config.transactionCookie, result.cookie, config.transactionMs / 1000);
  if (config.mode === "probe") setCookie(response, resultCookie, "", 0);
  return response;
});

export async function wecomGroupCallback(request: NextRequest): Promise<Response> {
  let retry = "/login?error=wecomGroup";
  try {
    const { site, config, login, resultCookie } = groupRuntime();
    if (config.mode === "probe") retry = "/login?error=wecomGroupProbe";
    const params = new URL(request.url).searchParams;
    if (config.mode === "probe" && !params.size) {
      const results = request.cookies.getAll(resultCookie);
      const proof = results.length === 1 ? results[0].value : "";
      const issuedAt = Number(proof.split(".", 1)[0]);
      const age = Date.now() - issuedAt;
      if (!/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(proof) || age < 0 || age >= PROBE_RESULT_SECONDS * 1000
        || !equalSecret(proof, signedProbeResult(site.encryptionKey, config.namespace, issuedAt))) return redirect(retry);
      const response = json({ probe: "wecom-group-workbench", result: "identity_verified", sessionCreated: false });
      setCookie(response, resultCookie, "", 0);
      return response;
    }

    const verified = await login.verifyCallback(params, readAccessCookie(request.headers, config.transactionCookie));
    if (config.mode === "employee-pilot") {
      const result = await getAccessService().completeWecomGroupLogin(verified);
      const response = redirect(new URL(result.returnTo, site.origin).href);
      setCookie(response, site.sessionCookie, result.sessionToken, (result.expiresAt - Date.now()) / 1000);
      setCookie(response, config.transactionCookie, "", 0);
      setCookie(response, loginArrivalCookie(site.sessionCookie), createLoginArrival(site, result.sessionToken, result.returnTo), LOGIN_ARRIVAL_MAX_AGE);
      return response;
    }
    // The second navigation has no credential in its URL and shows only a result.
    const response = redirect(new URL(WECOM_GROUP_CALLBACK, config.origin).href);
    setCookie(response, config.transactionCookie, "", 0);
    setCookie(response, resultCookie, signedProbeResult(site.encryptionKey, config.namespace, Date.now()), PROBE_RESULT_SECONDS);
    return response;
  } catch (error) {
    return redirect(error instanceof AccessError && error.status === 403 ? "/login?error=wecomGroupAccess" : retry);
  }
}

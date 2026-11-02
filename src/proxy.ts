import { NextResponse, type NextRequest } from "next/server";
import { getGuestAccessService, readAccessCookie, requireEmployee, requireSiteVisitor } from "@/modules/auth/access";
import { readAccessConfig } from "@/modules/auth/access-config";
import { readSiteAccessConfig } from "@/modules/auth/site-access-config";
import { callback } from "@/modules/auth/access-http";
import { classifyAccessPath, isPublicAuthPage, normalizeAccessPath, REQUEST_PATH_HEADER } from "@/modules/auth/page-access";
import { isLoginDocument, loginArrivalCookie, LOGIN_ARRIVAL_HEADER, validLoginArrival } from "@/modules/auth/login-arrival";

function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function proxy(request: NextRequest) {
  const path = normalizeAccessPath(request.nextUrl.pathname);
  // Classify the raw URL where available. The production adapter may normalize
  // /_next/data to its page first; that path still passes the employee gate.
  const kind = classifyAccessPath(new URL(request.url).pathname, request.nextUrl.searchParams.get("url"));
  if (kind === "invalid") return noStore(new NextResponse("无效的请求路径。", { status: 400 }));
  if (process.env.AUTH_MODE === "guest") {
    try {
      const site = readSiteAccessConfig();
      if (site.mode !== "guest") throw new Error("Invalid guest configuration");
      const clean = new URL(request.url);
      let credentialUrl = false;
      for (const name of new Set(["token", "code", "state", process.env.PORTAL_TOKEN_PARAM || "token", process.env.PORTAL_STATE_PARAM || "state"])) {
        if (clean.searchParams.has(name)) { clean.searchParams.delete(name); credentialUrl = true; }
      }
      if (credentialUrl) {
        const target = new URL(`${clean.pathname}${clean.search}`, site.origin);
        if (path === "/login" || path?.startsWith("/auth/")) { target.pathname = "/"; target.search = ""; }
        const response = noStore(NextResponse.redirect(target, 303));
        response.headers.set("Referrer-Policy", "no-referrer");
        return response;
      }
      if (path === "/login") return noStore(NextResponse.redirect(new URL("/", site.origin), 303));
      // Tool, administrator and identity-provider workflows are never guest pages.
      if (path === "/admin" || path?.startsWith("/admin/") || path === "/auth" || path?.startsWith("/auth/") || path?.startsWith("/api/admin/") || path?.startsWith("/api/client/") || (path?.startsWith("/api/auth/") && path !== "/api/auth/me")) {
        return noStore(new NextResponse("访客模式不提供员工权限。", { status: 403 }));
      }
      const forwarded = new Headers(request.headers);
      forwarded.set(REQUEST_PATH_HEADER, path!);
      forwarded.delete(LOGIN_ARRIVAL_HEADER);
      if (kind === "api") return noStore(NextResponse.next({ request: { headers: forwarded } }));
      // Public JS/CSS and build assets do not create anonymous sessions.
      if ((kind === "public" && !isPublicAuthPage(path!)) || path?.startsWith("/_next/static/")) return noStore(NextResponse.next({ request: { headers: forwarded } }));
      let token: string | undefined;
      try { await requireSiteVisitor(request); }
      catch (error) {
        if (!(error && typeof error === "object" && "status" in error && error.status === 401)) throw error;
        if (kind !== "page" || !["GET", "HEAD"].includes(request.method) || request.headers.has("rsc")) throw error;
        token = (await getGuestAccessService().issue()).token;
        // The initial server render sees precisely the cookie issued to the browser.
        const cookies = (forwarded.get("cookie") || "").split(";").map(value => value.trim()).filter(value => value && !value.startsWith(`${site.sessionCookie}=`));
        forwarded.set("cookie", [...cookies, `${site.sessionCookie}=${token}`].join("; "));
      }
      const response = noStore(NextResponse.next({ request: { headers: forwarded } }));
      if (token && readAccessCookie(forwarded, site.sessionCookie) === token) response.cookies.set(site.sessionCookie, token, { path: "/", httpOnly: true, sameSite: "lax", secure: site.secureCookies, maxAge: site.sessionAbsoluteMs / 1000 });
      return response;
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 503;
      return noStore(new NextResponse(status === 429 ? "请求过于频繁，请稍后重试。" : status === 401 ? "访客会话已失效，请刷新页面。" : "访客服务暂不可用。", { status: [401, 403, 429].includes(status) ? status : 503 }));
    }
  }
  // Consume the portal card's bearer token before the employee gate. No
  // rendered page, redirect returnTo or client script receives this URL.
  const tokenParam = process.env.PORTAL_TOKEN_PARAM || "token";
  if (path === "/" && request.nextUrl.searchParams.has(tokenParam)) {
    if (request.method !== "GET") return noStore(new NextResponse(null, { status: 405 }));
    if (process.env.AUTH_MODE === "iam") {
      // Portal tokens are not IAM authorization codes and cannot establish an
      // IAM session. Remove the credential before displaying any page.
      return noStore(NextResponse.redirect(new URL("/login?error=callback", request.url), 303));
    }
    return noStore(await callback(request));
  }
  const forwarded = new Headers(request.headers);
  // Always overwrite the untrusted client header, including on public routes.
  forwarded.set(REQUEST_PATH_HEADER, path!);
  forwarded.delete(LOGIN_ARRIVAL_HEADER);
  if (kind === "api") return NextResponse.next({ request: { headers: forwarded } });
  if (kind === "public") {
    const response = noStore(NextResponse.next({ request: { headers: forwarded } }));
    if (isPublicAuthPage(path!)) {
      // Native forms do not need hydration. Do not load anonymous script
      // requests, and never let callback tokens enter the Referer header.
      response.headers.set("Content-Security-Policy", "script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      // HTTP native forms need a non-opaque Origin for same-origin/CSRF
      // checks. Credential URLs are consumed and redirected before rendering;
      // these pages send only the origin, never a path or query credential.
      response.headers.set("Referrer-Policy", path?.endsWith("/callback") ? "no-referrer" : "strict-origin");
    }
    return response;
  }
  try {
    if (process.env.AUTH_MODE === "iam" && path === "/" && ["token", "code", "state"].some(name => request.nextUrl.searchParams.has(name))) {
      return noStore(NextResponse.redirect(new URL("/login?error=callback", readAccessConfig().origin), 303));
    }
    await requireEmployee(request);
    let arrivalCookie: string | undefined;
    let secureCookies = false;
    if (process.env.AUTH_MODE === "iam" && kind === "page" && isLoginDocument(request)) {
      const config = readAccessConfig();
      const name = loginArrivalCookie(config.sessionCookie);
      const markers = request.cookies.getAll(name);
      if (markers.length) {
        const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
        if (markers.length === 1 && validLoginArrival(config, markers[0].value, readAccessCookie(request.headers, config.sessionCookie), returnTo)) {
          arrivalCookie = name;
          secureCookies = config.secureCookies;
          forwarded.set(LOGIN_ARRIVAL_HEADER, path!);
        }
      }
    }
    const response = noStore(NextResponse.next({ request: { headers: forwarded } }));
    if (arrivalCookie) response.cookies.set(arrivalCookie, "", { path: "/", httpOnly: true, sameSite: "lax", secure: secureCookies, maxAge: 0 });
    return response;
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 503;
    // Next's production adapter strips flight headers and _rsc from some
    // requests. Those receive the same no-store login redirect as navigation;
    // both paths deny access before rendering any business payload.
    if (status === 401 && kind === "page" && !request.headers.has("rsc")) {
      const config = readAccessConfig();
      const target = new URL("/login", config.origin);
      const clean = new URL(request.url);
      clean.searchParams.delete(tokenParam);
      clean.searchParams.delete("token");
      clean.searchParams.delete("code");
      clean.searchParams.delete("state");
      const automaticEntry = config.mode === "iam" && path === "/" && isLoginDocument(request)
        && !request.nextUrl.searchParams.has("error") && !request.nextUrl.searchParams.has("loggedOut")
        // A successful callback with a rejected session cookie stops at retry.
        && !request.cookies.has(loginArrivalCookie(config.sessionCookie));
      if (automaticEntry) target.pathname = "/auth/iam/start";
      target.searchParams.set("returnTo", `${clean.pathname}${clean.search}`);
      return noStore(NextResponse.redirect(target, 303));
    }
    return noStore(new NextResponse(status === 401 ? "请先登录。" : status === 403 ? "没有访问权限。" : "统一登录服务暂不可用，请稍后重试。", {
      status: [401, 403].includes(status) ? status : 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }));
  }
}

// Do not exclude static files, chunks, RSC payloads, or image optimization.
export const config = { matcher: "/:path*" };

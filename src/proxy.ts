import { NextResponse, type NextRequest } from "next/server";
import { requireEmployee } from "@/modules/auth/access";
import { readAccessConfig } from "@/modules/auth/access-config";
import { classifyAccessPath, isPublicAuthPage, normalizeAccessPath, REQUEST_PATH_HEADER } from "@/modules/auth/page-access";

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
  const forwarded = new Headers(request.headers);
  // Always overwrite the untrusted client header, including on public routes.
  forwarded.set(REQUEST_PATH_HEADER, path!);
  if (kind === "api") return NextResponse.next({ request: { headers: forwarded } });
  if (kind === "public") {
    const response = noStore(NextResponse.next({ request: { headers: forwarded } }));
    if (isPublicAuthPage(path!)) {
      // Native forms do not need hydration. Do not load anonymous script
      // requests, and never let callback tokens enter the Referer header.
      response.headers.set("Content-Security-Policy", "script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      response.headers.set("Referrer-Policy", "no-referrer");
    }
    return response;
  }
  try {
    await requireEmployee(request);
    return noStore(NextResponse.next({ request: { headers: forwarded } }));
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 503;
    // Next's production adapter strips flight headers and _rsc from some
    // requests. Those receive the same no-store login redirect as navigation;
    // both paths deny access before rendering any business payload.
    if (status === 401 && kind === "page" && !request.headers.has("rsc")) {
      const target = new URL("/login", readAccessConfig().origin);
      target.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
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

import { NextResponse } from "next/server";
import { ADMIN_PORTAL_COOKIE, ADMIN_PORTAL_TTL_SECONDS, createAdminPortalSessionCookieValue, verifyAdminPortalPassword } from "@/modules/admin";
import { AppError, toErrorResponse } from "@/shared/errors";

export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  const response = toErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    if (!verifyAdminPortalPassword(password)) {
      throw new AppError("forbidden", "管理密码不正确。", 403);
    }

    const response = NextResponse.json({ data: { authenticated: true } });
    response.cookies.set(ADMIN_PORTAL_COOKIE, createAdminPortalSessionCookieValue(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_PORTAL_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ data: { authenticated: false } });
  response.cookies.set(ADMIN_PORTAL_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

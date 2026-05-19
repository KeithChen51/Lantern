import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authRepository, isPreviewIdentityId, PREVIEW_IDENTITY_IDS, PREVIEW_USER_COOKIE } from "@/modules/auth";
import type { AppRole } from "@/modules/tenant";
import { AppError, toErrorResponse } from "@/shared/errors";

export const dynamic = "force-dynamic";

type PreviewIdentity = {
  id: string;
  displayName: string;
  role: AppRole;
  label: string;
  description: string;
};

function getPrimaryRole(roles: AppRole[]): AppRole {
  return roles.includes("highest_admin") ? "highest_admin" : "normal_user";
}

function toPreviewIdentity(user: Awaited<ReturnType<typeof authRepository.findUserById>>): PreviewIdentity | null {
  if (!user) return null;
  const role = getPrimaryRole(user.roles);
  return {
    id: user.id,
    displayName: user.displayName,
    role,
    label: role === "highest_admin" ? "品牌管理员" : "一线用户",
    description: role === "highest_admin" ? "审核、编辑并发布共创指南" : "提交应做/避免共创内容",
  };
}

async function getPreviewIdentities() {
  const users = await Promise.all(PREVIEW_IDENTITY_IDS.map((id) => authRepository.findUserById(id)));
  return users.map(toPreviewIdentity).filter((identity): identity is PreviewIdentity => Boolean(identity));
}

function currentIdentity(identities: PreviewIdentity[], selectedId?: string) {
  return identities.find((identity) => identity.id === selectedId) ?? identities[0] ?? null;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const identities = await getPreviewIdentities();
    const current = currentIdentity(identities, cookieStore.get(PREVIEW_USER_COOKIE)?.value);
    return NextResponse.json({ data: { current, identities } });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { userId?: unknown };
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!isPreviewIdentityId(userId)) {
      throw new AppError("bad_request", "不支持该体验身份。", 400);
    }

    const identities = await getPreviewIdentities();
    const selected = currentIdentity(identities, userId);
    if (!selected) {
      throw new AppError("not_found", "体验身份尚未初始化。", 404);
    }

    const response = NextResponse.json({ data: { current: selected, identities } });
    response.cookies.set(PREVIEW_USER_COOKIE, selected.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

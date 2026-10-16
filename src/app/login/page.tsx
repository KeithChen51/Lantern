import { AuthNotice, AuthSurface } from "@/components/auth/AuthSurface";
import { safeReturnTo } from "@/modules/auth/page-access";
import { readAccessConfig } from "@/modules/auth/access-config";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const params = await searchParams;
  let configured = true;
  let cardMode = false;
  try { cardMode = readAccessConfig().portalLoginMode === "card"; } catch { configured = false; }
  return <AuthSurface title="员工登录">
    <p>{cardMode ? "请前往统一门户，点击灯塔应用卡片，再确认你的员工身份。" : "请使用统一员工账号登录。"}</p>
    {!configured && <AuthNotice>统一登录尚未完成配置，请联系平台维护人员。</AuthNotice>}
    {params.error && <AuthNotice>{params.error === "unavailable" ? "统一登录服务暂不可用，请稍后重试。" : "登录未完成，请重新登录。"}</AuthNotice>}
    <form action="/api/auth/start" method="post">
      <input type="hidden" name="returnTo" value={safeReturnTo(params.returnTo)} />
      <button type="submit" disabled={!configured}>{cardMode ? "前往统一门户" : "前往统一登录"}</button>
    </form>
  </AuthSurface>;
}

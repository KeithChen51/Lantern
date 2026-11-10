import { AuthNotice } from "@/components/auth/AuthSurface";
import { LoginSurface } from "@/components/auth/LoginSurface";
import { safeReturnTo } from "@/modules/auth/page-access";
import { readAccessConfig } from "@/modules/auth/access-config";
import { readSiteAccessConfig } from "@/modules/auth/site-access-config";
import { isIamWecomScanAvailable } from "@/modules/auth/iam-config";
import { isWecomAutoScanAvailable, WECOM_AUTO_ROUTES } from "@/modules/auth/wecom-auto-config";
import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string; loggedOut?: string }> }) {
  const params = await searchParams;
  let configured = true;
  let siteMode;
  try { siteMode = readSiteAccessConfig().mode; } catch { configured = false; }
  if (siteMode === "guest") redirect("/");
  let cardMode = false;
  let iamMode = process.env.AUTH_MODE === "iam";
  let groupScan = false;
  let autoScan = false;
  try {
    const config = readAccessConfig();
    cardMode = config.portalLoginMode === "card";
    iamMode = config.mode === "iam";
    groupScan = isIamWecomScanAvailable(config);
    autoScan = isWecomAutoScanAvailable(config);
  } catch { configured = false; }
  return <LoginSurface dealerLogin={autoScan}>
    <p>{groupScan || autoScan ? "请选择登录方式。" : iamMode ? "使用 OA 账号登录灯塔。" : cardMode ? "请前往统一门户，点击灯塔应用卡片，再确认你的员工身份。" : "请使用统一员工账号登录。"}</p>
    {iamMode && params.loggedOut === "1" && <AuthNotice>你已退出灯塔。</AuthNotice>}
    {!configured && <AuthNotice>统一登录尚未完成配置，请联系平台维护人员。</AuthNotice>}
    {params.loggedOut === "wecom" && <AuthNotice>{autoScan ? "你已退出灯塔。" : "你已退出灯塔。再次访问时请从汽车企微工作台打开灯塔。"}</AuthNotice>}
    {params.error === "wecomAccess" ? <AuthNotice>当前企微账号没有灯塔访问权限。请确认你在应用的可见范围内。</AuthNotice>
      : params.error === "wecom" ? <AuthNotice>企微登录未完成，请从汽车企微工作台重新打开灯塔。</AuthNotice>
      : params.error === "wecomScan" ? <AuthNotice>汽车企微扫码登录未完成。请确认应用已开通后重试。</AuthNotice>
      : params.error && <AuthNotice>{params.error === "unavailable" ? "统一登录服务暂不可用，请稍后重试。" : "登录未完成，请重新登录。"}</AuthNotice>}
    <form action="/api/auth/start" method="post">
      <input type="hidden" name="returnTo" value={safeReturnTo(params.returnTo)} />
      <button type="submit" disabled={!configured}>{iamMode ? "OA 登录" : cardMode ? "前往统一门户" : "前往统一登录"}</button>
      {groupScan && <>
        <button type="submit" data-login-secondary aria-describedby="group-scan-help">比亚迪集团员工 · 企微扫码</button>
        <p id="group-scan-help" data-login-hint>在集团统一登录页选择企业微信扫码。</p>
      </>}
      {autoScan && <button type="submit" data-login-secondary formAction={WECOM_AUTO_ROUTES.scan.start}>比亚迪汽车经销商 · 企微扫码</button>}
    </form>
  </LoginSurface>;
}

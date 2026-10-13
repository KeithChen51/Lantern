import { headers } from "next/headers";
import { getPendingLogin } from "@/modules/auth/access";
import { AuthNotice, AuthSurface } from "@/components/auth/AuthSurface";

export default async function ConfirmLoginPage() {
  let pending;
  try { pending = await getPendingLogin(await headers()); } catch {
    return <AuthSurface title="确认登录"><AuthNotice>登录确认已过期或服务暂不可用，请重新登录。</AuthNotice><a href="/login">重新登录</a></AuthSurface>;
  }
  return <AuthSurface title="确认员工账号">
    <p>请核对本次统一登录返回的账号。</p>
    <dl><dt>姓名</dt><dd>{pending.displayName}</dd><dt>员工账号</dt><dd>{pending.account}</dd></dl>
    <form action="/api/auth/portal-login" method="post"><input type="hidden" name="csrfToken" value={pending.csrfToken} /><button type="submit">使用此账号登录</button></form>
    <p><a href="/login">重新选择账号</a></p>
  </AuthSurface>;
}

import { headers } from "next/headers";
import { getDeviceRequest, requireWebAccount } from "@/modules/auth/access";
import { AuthNotice, AuthSurface } from "@/components/auth/AuthSurface";

export default async function DeviceApprovalPage({ searchParams }: { searchParams: Promise<{ user_code?: string; completed?: string }> }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const principal = await requireWebAccount(requestHeaders);
  if (params.completed === "1") return <AuthSurface title="工具授权"><p role="status">已记录你的授权决定。请返回发起请求的工具继续操作。</p><a href="/auth/tools">查看我的工具授权</a></AuthSurface>;
  if (params.user_code === undefined) return <AuthSurface title="工具授权">
    <form action="/auth/device" method="get">
      <label htmlFor="device-user-code">输入工具显示的授权码</label>
      <input id="device-user-code" name="user_code" autoComplete="off" spellCheck={false} maxLength={32} required />
      <button type="submit">查看授权请求</button>
    </form>
  </AuthSurface>;
  let device;
  try {
    const userCode = typeof params.user_code === "string" ? params.user_code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9-]{4,32}$/.test(userCode)) throw new Error("invalid_code");
    device = await getDeviceRequest(principal, userCode);
  } catch {
    return <AuthSurface title="工具授权"><AuthNotice>授权码无效、已过期或服务暂不可用。请在工具中重新发起登录。</AuthNotice><button type="button" disabled>批准授权</button></AuthSurface>;
  }
  return <AuthSurface title="确认工具授权">
    <p>仅批准你自己刚刚发起的请求。</p>
    <dl>
      <dt>{principal.kind === "dealer" ? "当前经销商账号" : "当前员工账号"}</dt><dd>{principal.displayName} · {principal.account}</dd>
      <dt>工具</dt><dd>{device.clientName}</dd>
      <dt>授权码</dt><dd>{device.userCode}</dd>
      <dt>权限</dt><dd>{principal.kind === "dealer" ? "读取公开发布的知识资源" : "读取知识资源"}（{device.scope}）</dd>
      <dt>请求有效期</dt><dd>{new Date(device.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd>
    </dl>
    <form action="/api/auth/device/decision" method="post">
      <input type="hidden" name="csrfToken" value={principal.csrfToken ?? ""} /><input type="hidden" name="userCode" value={device.userCode} />
      <button type="submit" name="approve" value="true">批准授权</button>{" "}<button type="submit" name="approve" value="false">拒绝</button>
    </form>
  </AuthSurface>;
}

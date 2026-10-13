import { headers } from "next/headers";
import { getDeviceRequest, requireEmployee } from "@/modules/auth/access";
import { AuthNotice, AuthSurface } from "@/components/auth/AuthSurface";

export default async function DeviceApprovalPage({ searchParams }: { searchParams: Promise<{ user_code?: string; completed?: string }> }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const principal = await requireEmployee(requestHeaders);
  if (params.completed === "1") return <AuthSurface title="工具授权"><p role="status">已记录你的授权决定。请返回发起请求的工具继续操作。</p><a href="/auth/tools">查看我的工具授权</a></AuthSurface>;
  let device;
  try {
    if (!params.user_code || !/^[A-Za-z0-9-]{4,32}$/.test(params.user_code)) throw new Error("invalid_code");
    device = await getDeviceRequest(requestHeaders, params.user_code);
  } catch {
    return <AuthSurface title="工具授权"><AuthNotice>授权码无效、已过期或服务暂不可用。请在工具中重新发起登录。</AuthNotice><button type="button" disabled>批准授权</button></AuthSurface>;
  }
  return <AuthSurface title="确认工具授权">
    <p>仅批准你自己刚刚发起的请求。</p>
    <dl><dt>当前员工账号</dt><dd>{principal.displayName} · {principal.account}</dd><dt>工具</dt><dd>{device.clientName}</dd><dt>授权码</dt><dd>{device.userCode}</dd><dt>权限</dt><dd>读取知识资源（{device.scope}）</dd><dt>请求有效期</dt><dd>{new Date(device.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd></dl>
    <form action="/api/auth/device/decision" method="post">
      <input type="hidden" name="csrfToken" value={principal.csrfToken ?? ""} /><input type="hidden" name="userCode" value={device.userCode} />
      <button type="submit" name="approve" value="true">批准授权</button>{" "}<button type="submit" name="approve" value="false">拒绝</button>
    </form>
  </AuthSurface>;
}

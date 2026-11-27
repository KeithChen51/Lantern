import { headers } from "next/headers";
import Link from "next/link";
import { requirePublicationAdmin } from "@/modules/auth/access";
import { getPublicationChannelInfo, publicationEnabled } from "@/modules/wecom-publications/configuration";
import { PlatformAdminNav } from "../PlatformAdminNav";
import { AdminWecomPublications } from "./AdminWecomPublications";

export const dynamic = "force-dynamic";

export default async function WecomPublicationsPage() {
  let principal;
  try { principal = await requirePublicationAdmin(await headers()); } catch (error) {
    const forbidden = error && typeof error === "object" && "status" in error && error.status === 403;
    return <section role="alert"><h1>企微发布</h1>
      <p>{forbidden ? "仅平台管理员可使用企微发布。" : "登录或权限验证暂不可用，请稍后重试。"}</p>
      <Link href="/">返回首页</Link>
    </section>;
  }

  return <>
    <PlatformAdminNav active="wecom-publications" canViewAnalytics={principal.capabilities.includes("analytics:summary")} canPublishWecom />
    {publicationEnabled() ? <AdminWecomPublications channels={getPublicationChannelInfo()} /> :
      <section role="status"><h2>企微发布尚未启用</h2><p>请完成发布应用和常驻执行服务配置后启用。</p></section>}
  </>;
}

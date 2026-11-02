import { headers } from "next/headers";
import Link from "next/link";
import { PageHeading } from "@/components/ui/PageHeading";
import { requireAnalyticsSummary } from "@/modules/auth/access";
import { getHermitContentGrant } from "@/modules/hermit/admin-records-access";
import { PlatformAdminNav } from "../PlatformAdminNav";
import styles from "../platform-admin.module.css";
import { HermitRecords } from "./HermitRecords";

export const dynamic = "force-dynamic";

export default async function HermitRecordsPage() {
  let principal;
  try {
    principal = await requireAnalyticsSummary(await headers());
  } catch (error) {
    const forbidden = error && typeof error === "object" && "status" in error && error.status === 403;
    return <section role="alert"><h1>路引记录</h1>
      <p>{forbidden ? "当前账号没有查看路引记录的权限。" : "登录或权限验证暂不可用，请稍后重试。"}</p>
      <Link href="/">返回首页</Link>
    </section>;
  }

  return <>
    <PlatformAdminNav active="hermit-records" canViewAnalytics />
    <div className={styles.page}>
      <PageHeading title="路引记录" description="查找已保存的路引会话，点开一条记录即可查看会话信息。" />
      <HermitRecords canReadContent={Boolean(getHermitContentGrant(principal))} />
    </div>
  </>;
}

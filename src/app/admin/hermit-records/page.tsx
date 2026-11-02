import { headers } from "next/headers";
import Link from "next/link";
import { requireAnalyticsSummary } from "@/modules/auth/access";
import { PlatformAdminNav } from "../PlatformAdminNav";
import styles from "../platform-admin.module.css";
import { HermitRecords } from "./HermitRecords";

export const dynamic = "force-dynamic";

export default async function HermitRecordsPage() {
  try {
    await requireAnalyticsSummary(await headers());
  } catch (error) {
    const forbidden = error && typeof error === "object" && "status" in error && error.status === 403;
    return <section role="alert"><h1>路引记录</h1>
      <p>{forbidden ? "当前账号没有查看路引记录的权限。" : "登录或权限验证暂不可用，请稍后重试。"}</p>
      <Link href="/">返回首页</Link>
    </section>;
  }

  return <div data-lh-records-workspace className={styles.recordsPage}>
    <PlatformAdminNav active="hermit-records" canViewAnalytics />
    <HermitRecords />
  </div>;
}

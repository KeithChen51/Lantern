import Link from "next/link";
import styles from "./platform-admin.module.css";

export function PlatformAdminNav({ active, canViewAnalytics }: {
  active: "knowledge" | "analytics";
  canViewAnalytics: boolean;
}) {
  return (
    <div className={styles.moduleHeader}>
      <p className={styles.moduleLabel}>平台管理</p>
      <nav aria-label="平台管理页面" className={styles.moduleNav}>
        <Link href="/admin/knowledge" aria-current={active === "knowledge" ? "page" : undefined}>知识管理</Link>
        {canViewAnalytics && <Link href="/admin/analytics" aria-current={active === "analytics" ? "page" : undefined}>访问与使用</Link>}
      </nav>
    </div>
  );
}

import Link from "next/link";
import { isHermitRecordsEnabled } from "@/config/features";
import { publicationEnabled } from "@/modules/wecom-publications/configuration";
import styles from "./platform-admin.module.css";

const pages = {
  knowledge: "知识管理",
  analytics: "访问与使用",
  "hermit-records": "路引记录",
  "wecom-publications": "企微发布",
} as const;

export function PlatformAdminNav({ active, canViewAnalytics, canPublishWecom = false }: {
  active: keyof typeof pages;
  canViewAnalytics: boolean;
  canPublishWecom?: boolean;
}) {
  return (
    <div className={styles.moduleHeader}>
      <h1 className={styles.moduleLabel}>平台管理<span className="sr-only"> · {pages[active]}</span></h1>
      <nav aria-label="平台管理页面" className={styles.moduleNav}>
        {Object.entries(pages).filter(([page]) => {
          if (page === "wecom-publications") return canPublishWecom && publicationEnabled();
          return (page === "knowledge" || canViewAnalytics) && (page !== "hermit-records" || isHermitRecordsEnabled());
        }).map(([page, label]) => (
          <Link key={page} href={`/admin/${page}`} aria-current={active === page ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}

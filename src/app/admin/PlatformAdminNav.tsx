import Link from "next/link";
import styles from "./platform-admin.module.css";

const pages = {
  knowledge: "知识管理",
  analytics: "访问与使用",
  "hermit-records": "路引记录",
} as const;

export function PlatformAdminNav({ active, canViewAnalytics }: {
  active: keyof typeof pages;
  canViewAnalytics: boolean;
}) {
  return (
    <div className={styles.moduleHeader}>
      <h1 className={styles.moduleLabel}>平台管理<span className="sr-only"> · {pages[active]}</span></h1>
      <nav aria-label="平台管理页面" className={styles.moduleNav}>
        {Object.entries(pages).filter(([page]) => page === "knowledge" || canViewAnalytics).map(([page, label]) => (
          <Link key={page} href={`/admin/${page}`} aria-current={active === page ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}

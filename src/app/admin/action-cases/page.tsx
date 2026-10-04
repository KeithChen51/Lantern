import Link from "next/link";
import { Icon } from "@iconify/react";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { AdminLoginClient } from "../AdminLoginClient";
import { isAdminPortalAuthenticated } from "../admin-auth";
import { AdminActionCasesClient } from "./AdminActionCasesClient";
import styles from "./action-cases.module.css";

export const dynamic = "force-dynamic";

export default async function AdminActionCasesPage() {
  if (!(await isAdminPortalAuthenticated())) {
    return <AdminLoginClient />;
  }

  return (
    <div className={styles.actionCasesPage}>
      <Link
        href="/admin"
        className={styles.backLink}
      >
        <Icon icon={lighthouseIcons.admin} className="h-4 w-4" />
        返回后台
      </Link>
      <AdminActionCasesClient />
    </div>
  );
}

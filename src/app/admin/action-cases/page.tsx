import Link from "next/link";
import { Icon } from "@iconify/react";
import { LhPageHero } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { AdminLoginClient } from "../AdminLoginClient";
import { isAdminPortalAuthenticated } from "../admin-auth";
import { AdminActionCasesClient } from "./AdminActionCasesClient";

export const dynamic = "force-dynamic";

export default async function AdminActionCasesPage() {
  if (!(await isAdminPortalAuthenticated())) {
    return <AdminLoginClient />;
  }

  return (
    <div className="space-y-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-2 text-sm font-bold text-primary-deep shadow-lh-sm transition-colors hover:border-line-strong hover:bg-primary-soft"
      >
        <Icon icon={lighthouseIcons.admin} className="h-4 w-4" />
        返回后台
      </Link>
      <LhPageHero
        icon={<Icon icon={lighthouseIcons.action} className="h-4 w-4" />}
        eyebrow="Action Admin"
        title="笃行案例维护"
        description={<p>维护内部服务实践案例。上传不会直接发布，必须先保存草稿，再手动发布到前台。</p>}
        asideTitle="发布规则"
        asideItems={[{ title: "Markdown 保留标题结构" }, { title: "一篇案例一张封面图" }, { title: "相同 slug 更新已有案例" }]}
      />
      <AdminActionCasesClient />
    </div>
  );
}

import Link from "next/link";
import { Icon } from "@iconify/react";
import { LhCard, LhChip } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { PageHeading } from "@/components/ui/PageHeading";
import styles from "./admin.module.css";

const adminAreas = [
  {
    title: "笃行案例维护",
    description: "上传 Markdown 和封面图，预览后保存草稿，并手动发布到笃行页面。",
    href: "/admin/action-cases",
    icon: lighthouseIcons.action,
    status: "首版维护入口",
  },
  {
    title: "知识文件管理",
    description: "像整理桌面文件夹一样管理知识目录，导入 Markdown、Skill 与工具资料。",
    href: "/admin/knowledge",
    icon: lighthouseIcons.document,
    status: "知识中台",
  },
];

export function AdminHome() {
  return (
    <div className={styles.adminHomePage}>
      <PageHeading title="内容维护" description="管理笃行案例与知识中台资料的草稿、预览与发布。" />

      <section className={styles.adminHomeSection}>
        <div className={styles.adminHomeSectionHeader}>
          <div>
            <p className={styles.adminEyebrow}>维护入口</p>
            <h2>选择要处理的内容</h2>
            <p>在一个受保护的后台中维护发布内容与知识文件。</p>
          </div>
        </div>
        <div className={styles.adminAreaGrid}>
          {adminAreas.map((area) => (
            <Link key={area.href} href={area.href} className="group block">
              <LhCard className={styles.adminAreaCard}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[var(--lh-control-radius)] border border-primary/20 bg-primary-soft text-primary-deep">
                    <Icon icon={area.icon} className="h-5 w-5" />
                  </span>
                  <LhChip tone="primary">{area.status}</LhChip>
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold leading-tight text-ink">{area.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">{area.description}</p>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-extrabold text-primary-deep">
                  进入处理
                  <Icon icon={lighthouseIcons.arrowRightUp} className="h-4 w-4" />
                </span>
              </LhCard>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

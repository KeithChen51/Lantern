import Link from "next/link";
import { Icon } from "@iconify/react";
import { LhCard, LhChip, LhPageHero, LhSectionHeader } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

const adminAreas = [
  {
    title: "笃行案例维护",
    description: "上传 Markdown 和封面图，预览后保存草稿，并手动发布到笃行页面。",
    href: "/admin/action-cases",
    icon: lighthouseIcons.action,
    status: "首版维护入口",
  },
  {
    title: "共创审核",
    description: "审核一线提交的 Do / Don't 行动指南，确认后发布到共创公共区。",
    href: "/admin/workshop",
    icon: lighthouseIcons.workshop,
    status: "已迁入后台",
  },
];

export function AdminHome() {
  return (
    <div className="space-y-8 pb-12">
      <LhPageHero
        icon={<Icon icon={lighthouseIcons.admin} className="h-4 w-4" />}
        eyebrow="Admin"
        title="内容维护后台"
        description={<p>这里只承载内部维护操作。普通内部人员继续通过原有页面访问内容，不需要账号登录。</p>}
        asideTitle="当前能力"
        asideItems={[{ title: "笃行案例导入" }, { title: "草稿与发布" }, { title: "共创审核入口" }]}
      />

      <section className="space-y-5">
        <LhSectionHeader
          eyebrow="维护入口"
          title="选择要处理的内容"
          description="首版先保持后台克制，只处理笃行案例和已有共创审核，不扩展为通用 CMS。"
        />
        <div className="grid gap-5 md:grid-cols-2">
          {adminAreas.map((area) => (
            <Link key={area.href} href={area.href} className="group block">
              <LhCard className="grid min-h-56 grid-rows-[auto_1fr_auto] gap-5 p-6 transition-[border-color,box-shadow] duration-150 group-hover:border-line-strong group-hover:shadow-lh-md">
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

"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { PreviewIdentitySwitcher } from "@/components/layout/PreviewIdentitySwitcher";
import { LhIconButton } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";

const SEARCH_TARGETS = [
  { href: "/", label: "本心", keywords: ["heart", "本心", "首页", "价值观", "文化"] },
  { href: "/mirror", label: "镜鉴", keywords: ["mirror", "镜鉴", "案例"] },
  { href: "/action", label: "笃行", keywords: ["action", "笃行", "行动", "实践"] },
  { href: "/workshop", label: "共创", keywords: ["workshop", "共创", "do", "dont", "指南", "提交"] },
  { href: "/admin/workshop", label: "共创审核", keywords: ["admin", "审核", "管理", "发布"] },
  { href: "/hermit", label: "路引", keywords: ["hermit", "路引", "决策", "对话"] },
];

const NOTIFICATIONS = [
  "新视觉迁移中：先完成组件库，再替换原版页面。",
  "当前重点：提高正文对比、状态可见性和操作层级。",
  "Solar 图标体系已锁定，新增控件继续沿用同一图标集。",
];

interface HeaderProps {
  isSidebarPinned: boolean;
  onOpenMobileNav: () => void;
}

export function Header({ isSidebarPinned, onOpenMobileNav }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [searchFeedback, setSearchFeedback] = React.useState("");
  const [isNotificationOpen, setIsNotificationOpen] = React.useState(false);

  React.useEffect(() => {
    setIsNotificationOpen(false);
    setSearchFeedback("");
  }, [pathname]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      setSearchFeedback("请输入关键词，例如：镜鉴、本心、笃行、共创、路引。");
      return;
    }

    const matchedTarget = SEARCH_TARGETS.find((target) =>
      target.keywords.some((keyword) => {
        const normalizedKeyword = keyword.toLowerCase();
        return normalizedKeyword.includes(normalizedQuery) || normalizedQuery.includes(normalizedKeyword);
      }),
    );

    if (!matchedTarget) {
      setSearchFeedback("未找到匹配页面，可尝试：本心 / 镜鉴 / 笃行 / 共创 / 审核 / 路引。");
      return;
    }

    router.push(matchedTarget.href);
    setSearchFeedback(`已跳转到 ${matchedTarget.label}。`);
  };

  return (
    <header
      className={cn(
        "pointer-events-none fixed left-0 right-0 top-0 z-40 h-20 px-4 pt-3 transition-[padding] duration-200 ease-out md:px-6",
        isSidebarPinned ? "md:pl-[272px]" : "md:pl-[104px]",
      )}
    >
      <div className="pointer-events-auto mx-auto grid h-14 w-full max-w-[1680px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-panel/95 px-3 shadow-lh-sm">
        <LhIconButton
          type="button"
          label="打开导航菜单"
          icon={<Icon icon={lighthouseIcons.menu} className="h-5 w-5" />}
          onClick={onOpenMobileNav}
          size="sm"
          className="md:hidden"
        />

        <form onSubmit={handleSearchSubmit} className="relative min-w-0">
          <div className="relative">
            <Icon
              icon={lighthouseIcons.search}
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="text"
              placeholder="搜索页面：本心、镜鉴、共创、路引"
              className="h-10 w-full rounded-sm border border-line bg-surface-quiet pl-10 pr-3 text-sm font-medium text-ink outline-none transition-[background,border-color,box-shadow] placeholder:text-muted hover:border-line-strong focus:border-signal focus:bg-panel"
            />
          </div>
          {searchFeedback && (
            <p
              className="absolute left-0 top-full mt-2 w-min min-w-full max-w-[min(560px,calc(100vw-32px))] rounded-sm border border-line bg-panel px-3 py-2 text-xs font-bold leading-5 text-muted shadow-lh-sm"
              aria-live="polite"
            >
              {searchFeedback}
            </p>
          )}
        </form>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <div className="hidden lg:block">
            <PreviewIdentitySwitcher />
          </div>

          <div className="relative">
            <LhIconButton
              type="button"
              label="通知"
              icon={<Icon icon={lighthouseIcons.bell} className="h-5 w-5" />}
              onClick={() => setIsNotificationOpen((prev) => !prev)}
              size="sm"
            />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-panel bg-signal" />

            {isNotificationOpen && (
              <div className="absolute right-0 top-12 w-[min(20rem,calc(100vw-32px))] rounded-md border border-line bg-panel p-4 text-sm text-ink-soft shadow-lh-md">
                <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-primary-deep">通知</p>
                <ul className="space-y-2">
                  {NOTIFICATIONS.map((item) => (
                    <li key={item} className="leading-6">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

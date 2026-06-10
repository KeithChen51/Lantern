"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { PreviewIdentitySwitcher } from "@/components/layout/PreviewIdentitySwitcher";
import { LhIconButton } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { isPublicWorkshopEnabled } from "@/config/features";
import { cn } from "@/lib/utils";
import { getHeaderSearchMatches, resolveHeaderSearch } from "./header-search";

const WORKSHOP_IS_PUBLIC = isPublicWorkshopEnabled();

const NOTIFICATIONS = [
  "路引已可直接接收服务场景，并按事实、依据和下一步话术回应。",
  ...(WORKSHOP_IS_PUBLIC ? ["行动指南支持提交岗位应做/避免建议，审核后进入公共指南。"] : []),
  "镜鉴与笃行分别用于外部标杆和内部实践复盘。",
];

const SEARCH_PLACEHOLDER = WORKSHOP_IS_PUBLIC ? "搜索：本心、镜鉴、笃行、行动指南、路引" : "搜索：本心、镜鉴、笃行、路引";
const SEARCH_FALLBACK_HINT = WORKSHOP_IS_PUBLIC
  ? "未找到匹配页面，可尝试：本心 / 镜鉴 / 笃行 / 行动指南 / 路引。"
  : "未找到匹配页面，可尝试：本心 / 镜鉴 / 笃行 / 路引。";

interface HeaderProps {
  isSidebarPinned: boolean;
  onOpenMobileNav: () => void;
}

export function Header({ isSidebarPinned, onOpenMobileNav }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [searchFeedback, setSearchFeedback] = React.useState("");
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = React.useState(false);
  const searchMatches = React.useMemo(() => getHeaderSearchMatches(query, 6), [query]);

  React.useEffect(() => {
    setIsNotificationOpen(false);
    setSearchFeedback("");
    setIsSearchOpen(false);
  }, [pathname]);

  const submitSearchQuery = (rawQuery: string) => {
    const trimmedQuery = rawQuery.trim();
    if (!trimmedQuery) {
      setIsSearchOpen(true);
      setSearchFeedback("请输入关键词，或从下方页面建议中选择。");
      return;
    }

    const matchedTarget = resolveHeaderSearch(trimmedQuery);

    if (!matchedTarget) {
      setIsSearchOpen(true);
      setSearchFeedback(SEARCH_FALLBACK_HINT);
      return;
    }

    router.push(matchedTarget.href);
    setSearchFeedback(`已跳转到 ${matchedTarget.label}。`);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitSearchQuery(query);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitSearchQuery(event.currentTarget.value);
  };

  const handleSearchTarget = (href: string, label: string) => {
    setQuery("");
    setIsSearchOpen(false);
    setSearchFeedback(`已跳转到 ${label}。`);
    router.push(href);
  };

  return (
    <header
      data-lh-header
      data-sidebar-pinned={isSidebarPinned ? "true" : "false"}
      className={cn(
        "pointer-events-none fixed left-0 right-0 top-0 z-40 h-20 bg-gradient-to-b from-page via-page/85 to-transparent px-4 pt-3 transition-[padding] duration-200 ease-out md:px-6",
        isSidebarPinned ? "md:pl-[var(--lh-classic-main-offset)]" : "md:pl-[var(--lh-classic-main-collapsed-offset)]",
      )}
    >
      <div
        data-lh-header-bar
        className="pointer-events-auto mx-auto grid h-14 w-full max-w-[1680px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--lh-card-radius)] border border-line bg-panel/95 px-3 shadow-[var(--lh-card-shadow)] [backdrop-filter:var(--lh-shell-blur)]"
      >
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
              data-lh-search-input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchFeedback("");
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              type="text"
              placeholder={SEARCH_PLACEHOLDER}
              className="h-10 w-full rounded-[var(--lh-control-radius)] border border-line bg-surface-quiet pl-10 pr-3 text-sm font-medium text-ink outline-none transition-[background,border-color,box-shadow] placeholder:text-muted hover:border-line-strong focus:border-signal focus:bg-panel"
            />
          </div>
          {(isSearchOpen || searchFeedback) && (
            <div className="absolute left-0 top-full mt-2 w-min min-w-full max-w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-[var(--lh-card-radius)] border border-line bg-panel text-sm shadow-[var(--lh-card-hover-shadow)] [backdrop-filter:var(--lh-shell-blur)]">
              {searchFeedback && (
                <p className="border-b border-line bg-surface-quiet px-3 py-2 text-xs font-bold leading-5 text-muted" aria-live="polite">
                  {searchFeedback}
                </p>
              )}
              {searchMatches.length > 0 ? (
                <div className="grid p-1" role="listbox" aria-label="搜索结果">
                  {searchMatches.map((target) => (
                    <button
                      key={target.href}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSearchTarget(target.href, target.label)}
                      className="grid gap-0.5 rounded-[var(--lh-control-radius)] px-3 py-2 text-left transition-colors hover:bg-primary-soft focus:bg-primary-soft focus:outline-none"
                    >
                      <span className="text-sm font-extrabold text-ink">{target.label}</span>
                      <span className="text-xs font-bold leading-5 text-muted">{target.description}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-3 text-xs font-bold leading-5 text-muted">没有匹配结果。</p>
              )}
            </div>
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
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full border border-panel bg-signal" />

            {isNotificationOpen && (
              <div className="absolute right-0 top-12 w-[min(20rem,calc(100vw-32px))] rounded-[var(--lh-card-radius)] border border-line bg-panel p-4 text-sm text-ink-soft shadow-[var(--lh-card-hover-shadow)] [backdrop-filter:var(--lh-shell-blur)]">
                <p className="mb-3 text-xs font-extrabold text-primary-deep">今日可处理</p>
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

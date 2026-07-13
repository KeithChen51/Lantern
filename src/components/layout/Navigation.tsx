"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { LhIconButton } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { isPublicWorkshopEnabled } from "@/config/features";
import { useLhScrollProgress } from "@/hooks/use-lighthouse-motion";
import { cn } from "@/lib/utils";
import { getFeedbackHref } from "./feedback-link";
import { getHeaderSearchMatches, resolveHeaderSearch } from "./header-search";
import { getVisibleNavItems } from "./navigation-model";

const WORKSHOP_IS_PUBLIC = isPublicWorkshopEnabled();

const NOTIFICATIONS = [
  "路引已可直接接收服务场景，并按事实、依据和下一步话术回应。",
  ...(WORKSHOP_IS_PUBLIC ? ["行动指南支持提交岗位应做/避免建议，审核后进入公共指南。"] : []),
  "镜鉴与笃行分别用于外部标杆和内部实践复盘。",
];

const SEARCH_PLACEHOLDER = "搜索";
const SEARCH_FALLBACK_HINT = WORKSHOP_IS_PUBLIC
  ? "未找到匹配页面，可尝试：本心 / 镜鉴 / 笃行 / 行动指南 / 路引。"
  : "未找到匹配页面，可尝试：本心 / 镜鉴 / 笃行 / 路引。";

interface NavigationProps {
  isPinned: boolean;
  onTogglePin: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  isHomeSurface?: boolean;
}

function isItemActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname.startsWith(href);
}

function LighthouseMark({ className }: { className?: string }) {
  return (
    <span data-lh-logo-mark className={cn("flex items-center justify-center", className)}>
      <Image
        data-lh-logo-image
        src="/nav-lighthouse-transparent.png"
        alt=""
        width={102}
        height={256}
        priority
        className="h-full w-auto object-contain"
      />
    </span>
  );
}

function Logo({
  isExpanded,
  onTogglePin,
  showToggle = true,
}: {
  isExpanded: boolean;
  onTogglePin: () => void;
  showToggle?: boolean;
}) {
  if (!isExpanded) {
    return (
      <button
        data-lh-logo
        data-expanded="false"
        type="button"
        onClick={onTogglePin}
        className="group grid min-h-12 grid-cols-1 items-center justify-items-center rounded-[var(--lh-card-radius)] border border-[var(--lh-deck-panel-border)] bg-[var(--lh-deck-panel-bg)] p-2 text-[var(--color-deck-text)] shadow-[var(--lh-card-shadow)] transition-[background,border-color,box-shadow,color,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] hover:border-[var(--lh-deck-panel-active-border)] hover:bg-[var(--lh-deck-panel-hover)]"
        aria-label="展开侧栏"
        title="展开侧栏"
      >
        <span className="relative flex h-10 w-10 items-center justify-center">
          <LighthouseMark className="h-10 w-10 transition-[opacity,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-out)] group-hover:scale-95 group-hover:opacity-0 group-focus-visible:scale-95 group-focus-visible:opacity-0" />
          <Icon
            icon={lighthouseIcons.expandSidebar}
            className="absolute h-6 w-6 scale-90 text-[var(--color-action-deep)] opacity-0 drop-shadow-[0_2px_4px_rgba(217,119,6,0.24)] transition-[color,opacity,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-out)] group-hover:scale-100 group-hover:opacity-100 group-hover:text-[var(--color-action)] group-focus-visible:scale-100 group-focus-visible:opacity-100 group-focus-visible:text-[var(--color-action)]"
          />
        </span>
      </button>
    );
  }

  return (
    <div data-lh-logo-shell className="relative">
      <Link
        data-lh-logo
        data-expanded="true"
        href="/"
        className="grid min-h-12 grid-cols-[32px_minmax(0,1fr)] items-center gap-2.5 rounded-[var(--lh-card-radius)] border border-[var(--lh-deck-panel-border)] bg-[var(--lh-deck-panel-bg)] p-3 text-[var(--color-deck-text)] shadow-[var(--lh-card-shadow)] transition-[background,border-color,box-shadow,color,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] hover:border-[var(--lh-deck-panel-active-border)] hover:bg-[var(--lh-deck-panel-hover)]"
        aria-label="灯塔首页"
      >
        <LighthouseMark className="h-12 w-8" />
        <span data-lh-logo-copy className="min-w-0">
          <span data-lh-logo-title className="block text-[length:var(--title-card)] font-[var(--weight-bold)] leading-none text-[var(--color-deck-text)]">灯塔</span>
          <span data-lh-logo-subtitle className="mt-1 block text-[length:var(--type-caption)] font-[var(--weight-bold)] leading-[var(--leading-caption)] text-[var(--color-deck-muted-strong)]">服务文化数字平台</span>
        </span>
      </Link>
      {showToggle && (
        <button
          data-lh-sidebar-toggle
          data-lh-logo-toggle
          type="button"
          onClick={onTogglePin}
          className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-[var(--color-action-deep)] drop-shadow-[0_2px_4px_rgba(217,119,6,0.24)] transition-[color,opacity,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] hover:text-[var(--color-action)] focus-visible:text-[var(--color-action)]"
          aria-label="收起侧栏"
          title="收起侧栏"
        >
          <Icon icon={lighthouseIcons.collapseSidebar} className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

function SidebarSearch({ isExpanded, onNavigate, className }: { isExpanded: boolean; onNavigate?: () => void; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [searchFeedback, setSearchFeedback] = React.useState("");
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const searchMatches = React.useMemo(() => getHeaderSearchMatches(query, 6), [query]);

  React.useEffect(() => {
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
    onNavigate?.();
    setSearchFeedback(`已跳转到 ${matchedTarget.label}。`);
  };

  const handleSearchTarget = (href: string, label: string) => {
    setQuery("");
    setIsSearchOpen(false);
    setSearchFeedback(`已跳转到 ${label}。`);
    router.push(href);
    onNavigate?.();
  };

  if (!isExpanded) {
    return (
      <div className={cn("relative", className)}>
        <button
          type="button"
          data-lh-sidebar-search-trigger
          onClick={() => setIsSearchOpen((prev) => !prev)}
          className="grid min-h-11 w-full items-center justify-items-center rounded-[var(--lh-control-radius)] border border-transparent text-[var(--color-deck-text-soft)] transition-[background,border-color,color,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] hover:border-[var(--lh-deck-panel-border)] hover:bg-[var(--lh-deck-panel-hover)] hover:text-action"
          aria-expanded={isSearchOpen}
          aria-label="打开搜索"
          title="搜索"
        >
          <Icon icon={lighthouseIcons.search} className="h-5 w-5" />
        </button>
        {isSearchOpen && (
          <div
            data-lh-popover
            className="absolute left-[calc(100%+0.5rem)] top-0 z-20 w-72 rounded-[var(--lh-card-radius)] border border-line bg-panel p-2 shadow-[var(--lh-card-hover-shadow)] [--lh-popover-origin:left_top] [backdrop-filter:var(--lh-shell-blur)]"
          >
            <SidebarSearchPanel
              query={query}
              setQuery={setQuery}
              searchFeedback={searchFeedback}
              setSearchFeedback={setSearchFeedback}
              searchMatches={searchMatches}
              onSubmit={submitSearchQuery}
              onTarget={handleSearchTarget}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <SidebarSearchPanel
        query={query}
        setQuery={setQuery}
        searchFeedback={searchFeedback}
        setSearchFeedback={setSearchFeedback}
        searchMatches={searchMatches}
        onSubmit={submitSearchQuery}
        onTarget={handleSearchTarget}
        isOpen={isSearchOpen}
        setIsOpen={setIsSearchOpen}
      />
    </div>
  );
}

function SidebarSearchPanel({
  query,
  setQuery,
  searchFeedback,
  setSearchFeedback,
  searchMatches,
  onSubmit,
  onTarget,
  isOpen = true,
  setIsOpen,
}: {
  query: string;
  setQuery: (value: string) => void;
  searchFeedback: string;
  setSearchFeedback: (value: string) => void;
  searchMatches: ReturnType<typeof getHeaderSearchMatches>;
  onSubmit: (value: string) => void;
  onTarget: (href: string, label: string) => void;
  isOpen?: boolean;
  setIsOpen?: (value: boolean) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(query);
      }}
      className="relative min-w-0"
    >
      <div className="relative">
        <Icon icon={lighthouseIcons.search} className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-primary" />
        <input
          data-lh-search-input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchFeedback("");
            setIsOpen?.(true);
          }}
          onFocus={() => setIsOpen?.(true)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onSubmit(event.currentTarget.value);
          }}
          type="text"
          placeholder={SEARCH_PLACEHOLDER}
          className="h-10 w-full rounded-[var(--lh-control-radius)] border border-line bg-surface-quiet pl-9 pr-3 text-[length:var(--type-control)] font-[var(--weight-bold)] leading-[var(--leading-control)] text-ink transition-[background,border-color,box-shadow] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] placeholder:text-muted hover:border-line-strong focus-visible:border-[var(--lh-focus-outline)] focus-visible:bg-panel"
        />
      </div>
      {(isOpen || searchFeedback) && (searchFeedback || query.trim()) && (
        <div
          data-lh-popover
          className="absolute left-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-32px))] overflow-hidden rounded-[var(--lh-card-radius)] border border-line bg-panel text-[length:var(--type-body)] shadow-[var(--lh-card-hover-shadow)] [--lh-popover-origin:left_top] [backdrop-filter:var(--lh-shell-blur)]"
        >
          {searchFeedback && (
            <p className="border-b border-line bg-surface-quiet px-3 py-2 text-[length:var(--type-label)] font-[var(--weight-bold)] leading-[var(--leading-label)] text-muted" aria-live="polite">
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
                  onClick={() => onTarget(target.href, target.label)}
                  className="grid gap-0.5 rounded-[var(--lh-control-radius)] px-3 py-2 text-left transition-[background,color] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] hover:bg-primary-soft focus-visible:bg-primary-soft"
                >
                  <span className="text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-ink">{target.label}</span>
                  <span className="text-[length:var(--type-label)] font-[var(--weight-bold)] leading-[var(--leading-label)] text-muted">{target.description}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-3 text-[length:var(--type-label)] font-[var(--weight-bold)] leading-[var(--leading-label)] text-muted">没有匹配结果。</p>
          )}
        </div>
      )}
    </form>
  );
}

function SidebarFeedbackLink({
  isExpanded,
  className,
  onNavigate,
}: {
  isExpanded: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith("/feedback");

  return (
    <Link
      data-lh-feedback-link
      data-active={isActive ? "true" : "false"}
      href={getFeedbackHref(pathname)}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative grid min-h-11 items-center rounded-[var(--lh-control-radius)] border px-3 py-2 transition-[background,border-color,color,box-shadow,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] active:translate-y-px active:scale-[0.985]",
        isExpanded ? "grid-cols-[24px_minmax(0,1fr)] gap-3" : "grid-cols-1 justify-items-center",
        isActive
          ? "border-[var(--lh-deck-panel-active-border)] bg-[var(--lh-deck-panel-active)] text-[var(--color-deck-text)] shadow-[var(--lh-card-shadow)]"
          : "border-transparent text-[var(--color-deck-text-soft)] hover:border-[var(--lh-deck-panel-border)] hover:bg-[var(--lh-deck-panel-hover)] hover:text-[var(--color-deck-text)]",
        className,
      )}
      title={isExpanded ? undefined : "意见反馈"}
    >
      <Icon
        icon={lighthouseIcons.edit}
        className={cn("h-5 w-5", isActive ? "text-action" : "text-[var(--color-deck-icon)] group-hover:text-action")}
      />
      {isExpanded && <span className="text-left text-[length:var(--type-control)] font-[var(--weight-bold)] leading-[var(--leading-control)]">意见反馈</span>}
    </Link>
  );
}

function SidebarNotifications({ isExpanded, className }: { isExpanded: boolean; className?: string }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <div data-lh-sidebar-notifications className={cn("relative", className)}>
      <button
        data-lh-sidebar-notification-button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className={cn(
          "relative grid min-h-11 items-center rounded-[var(--lh-control-radius)] border border-transparent bg-transparent px-3 py-2 text-[length:var(--type-control)] font-[var(--weight-bold)] leading-[var(--leading-control)] text-[var(--color-deck-text-soft)] transition-[background,border-color,color,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] hover:bg-[var(--lh-deck-panel-hover)] hover:text-action",
          isExpanded ? "grid-cols-[24px_minmax(0,1fr)] gap-3" : "grid-cols-1 justify-items-center",
        )}
        aria-label="通知"
        title="通知"
      >
        <Icon icon={lighthouseIcons.bell} className="h-5 w-5" />
        <span data-lh-sidebar-notification-dot className="absolute left-8 top-2 h-1.5 w-1.5 rounded-full border border-panel bg-signal" />
        {isExpanded && <span className="text-left">消息提醒</span>}
      </button>

      {isOpen && (
        <div
          data-lh-popover
          className={cn(
            "absolute bottom-12 z-20 w-[min(20rem,calc(100vw-32px))] rounded-[var(--lh-card-radius)] border border-line bg-panel p-4 text-[length:var(--type-body)] leading-[var(--leading-body)] text-ink-soft shadow-[var(--lh-card-hover-shadow)] [--lh-popover-origin:left_bottom] [backdrop-filter:var(--lh-shell-blur)]",
            isExpanded ? "left-0" : "left-[calc(100%+0.5rem)]",
          )}
        >
          <p className="mb-3 text-[length:var(--title-kicker)] font-[var(--weight-black)] leading-[1.2] tracking-[var(--tracking-kicker)] text-primary-text">今日可处理</p>
          <ul className="space-y-2">
            {NOTIFICATIONS.map((item) => (
              <li key={item} className="leading-[var(--leading-body)]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NavLinks({
  isExpanded,
  pathname,
  onNavigate,
}: {
  isExpanded: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return getVisibleNavItems().map((item) => {
    const isActive = isItemActive(pathname, item.href);

    return (
      <Link
        data-lh-nav-link
        data-active={isActive ? "true" : "false"}
        key={item.label}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "group relative grid min-h-12 items-center rounded-[var(--lh-control-radius)] border px-3 py-2 transition-[background,border-color,color,box-shadow,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)]",
          isExpanded ? "grid-cols-[24px_minmax(0,1fr)] gap-3" : "grid-cols-1 justify-items-center",
          isActive
            ? "border-[var(--lh-deck-panel-active-border)] bg-[var(--lh-deck-panel-active)] text-[var(--color-deck-text)] shadow-[var(--lh-card-shadow)]"
            : "border-transparent text-[var(--color-deck-text-soft)] hover:border-[var(--lh-deck-panel-border)] hover:bg-[var(--lh-deck-panel-hover)] hover:text-[var(--color-deck-text)]",
        )}
        title={isExpanded ? undefined : `${item.subLabel} ${item.label}`}
      >
        {isActive && <span data-lh-nav-active-marker className="absolute left-0 top-2 h-[calc(100%-16px)] w-0.5 rounded-r-full bg-action" />}
        <Icon
          data-lh-nav-icon
          icon={item.icon}
          className={cn("h-5 w-5", isActive ? "text-action" : "text-[var(--color-deck-icon)] group-hover:text-action")}
        />
        {isExpanded && (
          <span data-lh-nav-copy className="min-w-0">
            <span data-lh-nav-sub-label className="block truncate text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)]">{item.subLabel}</span>
            <span data-lh-nav-label className={cn("block truncate text-[length:var(--type-caption)] font-[var(--weight-bold)] leading-[var(--leading-caption)]", isActive ? "text-[var(--color-deck-muted-strong)]" : "text-[var(--color-deck-muted)]")}>
              {item.label}
            </span>
          </span>
        )}
      </Link>
    );
  });
}

export function Navigation({ isPinned, onTogglePin, isMobileOpen, onMobileClose, isHomeSurface = false }: NavigationProps) {
  const pathname = usePathname();
  const isExpanded = isPinned;
  const desktopSidebarRef = React.useRef<HTMLElement | null>(null);
  const desktopSidebarStyle = {
    width: isExpanded ? "var(--lh-classic-sidebar-width)" : "var(--lh-classic-sidebar-collapsed-width)",
    ...(isHomeSurface
      ? {
          "--lh-home-nav-progress": "0%",
          "--lh-home-nav-progress-value": 0,
        }
      : {}),
  } as React.CSSProperties;

  useLhScrollProgress({
    enabled: isHomeSurface,
    range: 0.72,
    respectReducedMotion: false,
    onProgress: (progress) => {
      const node = desktopSidebarRef.current;
      if (!node) return;
      node.style.setProperty("--lh-home-nav-progress", `${(progress * 100).toFixed(1)}%`);
      node.style.setProperty("--lh-home-nav-progress-value", progress.toFixed(3));
    },
  });

  React.useEffect(() => {
    const node = desktopSidebarRef.current;
    if (!node || isHomeSurface) return;
    node.style.removeProperty("--lh-home-nav-progress");
    node.style.removeProperty("--lh-home-nav-progress-value");
  }, [isHomeSurface]);

  return (
    <>
      <nav
        ref={desktopSidebarRef}
        data-lh-sidebar
        data-expanded={isExpanded ? "true" : "false"}
        data-home-surface={isHomeSurface ? "true" : undefined}
        style={desktopSidebarStyle}
        className="fixed left-0 top-0 z-50 hidden h-screen flex-col border-r border-[var(--lh-deck-panel-border)] bg-[linear-gradient(180deg,var(--color-deck),var(--color-deck-soft))] px-4 py-5 shadow-[var(--lh-card-shadow)] transition-[width] duration-[var(--lh-motion-medium)] ease-[var(--lh-ease-out)] md:flex"
        aria-label="主导航"
      >
        <Logo isExpanded={isExpanded} onTogglePin={onTogglePin} />
        <SidebarSearch isExpanded={isExpanded} className={isExpanded ? "mt-5" : "mt-4"} />

        <div data-lh-sidebar-nav-group className="mt-6 flex flex-1 flex-col gap-2">
          <NavLinks isExpanded={isExpanded} pathname={pathname} />
        </div>

        <div data-lh-sidebar-utility-group className="mt-auto grid gap-2">
          <SidebarFeedbackLink isExpanded={isExpanded} />
          <SidebarNotifications isExpanded={isExpanded} />
        </div>
      </nav>

      <div
        className={cn(
          "fixed inset-0 z-50 bg-ink/30 transition-opacity duration-[var(--lh-motion-medium)] ease-[var(--lh-ease-standard)] md:hidden",
          isMobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button type="button" onClick={onMobileClose} aria-label="关闭导航菜单" className="absolute inset-0" />
        <nav
          data-lh-sidebar
          data-mobile="true"
          className={cn(
            "absolute left-0 top-0 flex h-full w-[min(86vw,320px)] flex-col border-r border-[var(--lh-deck-panel-border)] bg-[linear-gradient(180deg,var(--color-deck),var(--color-deck-soft))] px-4 py-5 shadow-[var(--lh-card-hover-shadow)] transition-transform duration-[var(--lh-motion-medium)] ease-[var(--lh-ease-out)] [backdrop-filter:var(--lh-shell-blur)]",
            isMobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="移动端主导航"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <Logo isExpanded onTogglePin={onTogglePin} showToggle={false} />
            <LhIconButton
              type="button"
              label="关闭导航菜单"
              icon={<Icon icon={lighthouseIcons.close} className="h-5 w-5" />}
              onClick={onMobileClose}
              size="sm"
              className="border-[var(--lh-deck-panel-border)] bg-[var(--lh-deck-panel-bg)] text-[var(--color-deck-text)] hover:border-[var(--lh-deck-panel-active-border)] hover:bg-[var(--lh-deck-panel-hover)]"
            />
          </div>
          <SidebarSearch isExpanded onNavigate={onMobileClose} className="mt-5" />

          <div data-lh-sidebar-nav-group className="mt-6 flex flex-1 flex-col gap-2">
            <NavLinks isExpanded pathname={pathname} onNavigate={onMobileClose} />
          </div>

          <div data-lh-sidebar-utility-group className="mt-auto grid gap-2">
            <SidebarFeedbackLink isExpanded onNavigate={onMobileClose} />
            <SidebarNotifications isExpanded />
          </div>
        </nav>
      </div>
    </>
  );
}

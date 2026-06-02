"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { LhIconButton } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";
import { getVisibleNavItems } from "./navigation-model";

interface NavigationProps {
  isPinned: boolean;
  onTogglePin: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

function isItemActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname.startsWith(href);
}

function Logo({ isExpanded }: { isExpanded: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "grid min-h-12 grid-cols-[40px_minmax(0,1fr)] items-center gap-3 rounded-[var(--lh-card-radius)] border border-[var(--lh-deck-panel-border)] bg-[var(--lh-deck-panel-bg)] p-2 text-[var(--color-deck-text)] shadow-[var(--lh-card-shadow)] transition-colors hover:border-[var(--lh-deck-panel-active-border)] hover:bg-[var(--lh-deck-panel-hover)]",
        !isExpanded && "grid-cols-1 justify-items-center",
      )}
      aria-label="Lighthouse 首页"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-[var(--lh-control-radius)] bg-action text-panel shadow-[var(--lh-card-shadow)]">
        <Icon icon={lighthouseIcons.logo} className="h-5 w-5" />
      </span>
      {isExpanded && (
        <span className="min-w-0">
          <span className="block text-lg font-extrabold leading-tight text-[var(--color-deck-text)]">Lighthouse</span>
          <span className="block text-xs font-bold leading-tight text-[var(--color-deck-muted-strong)]">服务文化平台</span>
        </span>
      )}
    </Link>
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
        key={item.label}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "group relative grid min-h-12 items-center rounded-[var(--lh-control-radius)] border px-3 py-2 transition-[background,border-color,color,box-shadow] duration-150",
          isExpanded ? "grid-cols-[24px_minmax(0,1fr)] gap-3" : "grid-cols-1 justify-items-center",
          isActive
            ? "border-[var(--lh-deck-panel-active-border)] bg-[var(--lh-deck-panel-active)] text-[var(--color-deck-text)] shadow-[var(--lh-card-shadow)]"
            : "border-transparent text-[var(--color-deck-text-soft)] hover:border-[var(--lh-deck-panel-border)] hover:bg-[var(--lh-deck-panel-hover)] hover:text-[var(--color-deck-text)]",
        )}
        title={isExpanded ? undefined : `${item.subLabel} ${item.label}`}
      >
        {isActive && <span className="absolute left-0 top-2 h-[calc(100%-16px)] w-0.5 rounded-r-full bg-action" />}
        <Icon
          icon={item.icon}
          className={cn("h-5 w-5", isActive ? "text-action" : "text-[var(--color-deck-icon)] group-hover:text-action")}
        />
        {isExpanded && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold leading-tight">{item.subLabel}</span>
            <span className={cn("block truncate text-xs font-bold leading-tight", isActive ? "text-[var(--color-deck-muted-strong)]" : "text-[var(--color-deck-muted)]")}>
              {item.label}
            </span>
          </span>
        )}
      </Link>
    );
  });
}

export function Navigation({ isPinned, onTogglePin, isMobileOpen, onMobileClose }: NavigationProps) {
  const pathname = usePathname();
  const isExpanded = isPinned;

  return (
    <>
      <nav
        style={{ width: isExpanded ? "256px" : "88px" }}
        className="fixed left-0 top-0 z-50 hidden h-screen flex-col border-r border-[var(--lh-deck-panel-border)] bg-[linear-gradient(180deg,var(--color-deck),var(--color-deck-soft))] px-4 py-5 shadow-[var(--lh-card-shadow)] transition-[width] duration-200 ease-out md:flex"
        aria-label="主导航"
      >
        <Logo isExpanded={isExpanded} />

        <div className="mt-8 flex flex-1 flex-col gap-2">
          <NavLinks isExpanded={isExpanded} pathname={pathname} />
        </div>

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={onTogglePin}
            className={cn(
              "grid min-h-11 items-center rounded-[var(--lh-control-radius)] border border-[var(--lh-deck-panel-border)] bg-[var(--lh-deck-panel-bg)] px-3 py-2 text-sm font-bold text-[var(--color-deck-text-soft)] shadow-[var(--lh-card-shadow)] transition-colors hover:border-[var(--lh-deck-panel-active-border)] hover:bg-[var(--lh-deck-panel-hover)] hover:text-[var(--color-deck-text)]",
              isExpanded ? "grid-cols-[20px_minmax(0,1fr)] gap-3" : "justify-items-center",
            )}
            aria-label={isPinned ? "收起侧栏" : "固定侧栏"}
          >
            <Icon icon={isPinned ? lighthouseIcons.pin : lighthouseIcons.unpin} className="h-5 w-5" />
            {isExpanded && <span className="text-left">{isPinned ? "收起侧栏" : "固定侧栏"}</span>}
          </button>
        </div>
      </nav>

      <div
        className={cn(
          "fixed inset-0 z-50 bg-ink/30 transition-opacity duration-200 md:hidden",
          isMobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button type="button" onClick={onMobileClose} aria-label="关闭导航菜单" className="absolute inset-0" />
        <nav
          className={cn(
            "absolute left-0 top-0 flex h-full w-[min(86vw,320px)] flex-col border-r border-[var(--lh-deck-panel-border)] bg-[linear-gradient(180deg,var(--color-deck),var(--color-deck-soft))] px-4 py-5 shadow-[var(--lh-card-hover-shadow)] transition-transform duration-200 ease-out [backdrop-filter:var(--lh-shell-blur)]",
            isMobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="移动端主导航"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <Logo isExpanded />
            <LhIconButton
              type="button"
              label="关闭导航菜单"
              icon={<Icon icon={lighthouseIcons.close} className="h-5 w-5" />}
              onClick={onMobileClose}
              size="sm"
              className="border-[var(--lh-deck-panel-border)] bg-[var(--lh-deck-panel-bg)] text-[var(--color-deck-text)] hover:border-[var(--lh-deck-panel-active-border)] hover:bg-[var(--lh-deck-panel-hover)]"
            />
          </div>

          <div className="mt-8 flex flex-1 flex-col gap-2">
            <NavLinks isExpanded pathname={pathname} onNavigate={onMobileClose} />
          </div>

          <div className="mb-12 mt-6">
            <ThemeSwitcher />
          </div>
        </nav>
      </div>
    </>
  );
}

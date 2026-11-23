"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import { LhIconButton } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

interface HeaderProps {
  onOpenMobileNav: () => void;
  isMobileNavOpen?: boolean;
}

export function Header({ onOpenMobileNav, isMobileNavOpen = false }: HeaderProps) {
  const session = useEmployeeSession();
  return (
    <header
      data-lh-header
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-20 px-4 lg:hidden"
    >
      <div
        data-lh-header-bar
        className="pointer-events-auto mx-auto grid h-14 w-full max-w-[1680px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--lh-card-radius)] border border-line bg-panel/95 px-3 shadow-[var(--lh-card-shadow)] [backdrop-filter:var(--lh-shell-blur)]"
      >
        <LhIconButton
          type="button"
          label="打开导航菜单"
          aria-haspopup="dialog"
          aria-expanded={isMobileNavOpen}
          aria-controls="lighthouse-mobile-navigation"
          icon={<Icon icon={lighthouseIcons.menu} className="h-5 w-5" />}
          onClick={onOpenMobileNav}
          size="sm"
        />
        <Link href="/me" aria-label="我的" className="ml-auto inline-flex min-h-11 max-w-full items-center gap-2 rounded-[var(--lh-control-radius)] px-3 text-[length:var(--type-control)] font-[var(--weight-bold)] text-primary-text transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <Icon icon={lighthouseIcons.user} aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span className="truncate">{session?.user.displayName || "我的"}</span>
        </Link>
      </div>
    </header>
  );
}

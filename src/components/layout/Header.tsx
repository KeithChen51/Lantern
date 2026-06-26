"use client";

import { Icon } from "@iconify/react";
import { LhIconButton } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";

interface HeaderProps {
  isSidebarPinned: boolean;
  onOpenMobileNav: () => void;
}

export function Header({ isSidebarPinned, onOpenMobileNav }: HeaderProps) {
  return (
    <header
      data-lh-header
      data-sidebar-pinned={isSidebarPinned ? "true" : "false"}
      className={cn(
        "pointer-events-none fixed left-0 right-0 top-0 z-40 h-20 bg-gradient-to-b from-page via-page/85 to-transparent px-4 pt-3 transition-[padding] duration-200 ease-out md:hidden",
        isSidebarPinned ? "md:pl-[var(--lh-classic-main-offset)]" : "md:pl-[var(--lh-classic-main-collapsed-offset)]",
      )}
    >
      <div
        data-lh-header-bar
        className="pointer-events-auto mx-auto grid h-14 w-full max-w-[1680px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--lh-card-radius)] border border-line bg-panel/95 px-3 shadow-[var(--lh-card-shadow)] [backdrop-filter:var(--lh-shell-blur)]"
      >
        <LhIconButton
          type="button"
          label="打开导航菜单"
          icon={<Icon icon={lighthouseIcons.menu} className="h-5 w-5" />}
          onClick={onOpenMobileNav}
          size="sm"
        />
      </div>
    </header>
  );
}

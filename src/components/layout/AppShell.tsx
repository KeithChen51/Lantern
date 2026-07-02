"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Navigation } from "@/components/layout/Navigation";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "lighthouse-sidebar-pinned";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isHomeSurface = pathname === "/" || pathname === "/heart";
  const [isSidebarPinned, setIsSidebarPinned] = React.useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) {
      setIsSidebarPinned(stored === "true");
    }
  }, []);

  React.useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  const handleTogglePin = () => {
    const newValue = !isSidebarPinned;
    setIsSidebarPinned(newValue);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(newValue));
  };

  return (
    <div
      data-lh-shell
      data-lh-home-shell={isHomeSurface ? "true" : undefined}
      className="min-h-screen bg-transparent text-ink font-sans selection:bg-primary-soft selection:text-ink"
    >
      <Navigation
        isPinned={isSidebarPinned}
        onTogglePin={handleTogglePin}
        isMobileOpen={isMobileNavOpen}
        onMobileClose={() => setIsMobileNavOpen(false)}
        isHomeSurface={isHomeSurface}
      />
      <Header
        isSidebarPinned={isSidebarPinned}
        onOpenMobileNav={() => setIsMobileNavOpen(true)}
      />

      <main
        data-lh-main
        data-lh-home-main={isHomeSurface ? "true" : undefined}
        data-sidebar-pinned={isSidebarPinned ? "true" : "false"}
        className={cn(
          "min-h-screen transition-[padding] duration-200 ease-out",
          isHomeSurface
            ? "px-0 pb-0 pt-0"
            : "px-4 pb-8 pt-24 md:px-6",
          !isHomeSurface &&
            (isSidebarPinned ? "md:pl-[var(--lh-classic-main-offset)]" : "md:pl-[var(--lh-classic-main-collapsed-offset)]"),
        )}
      >
        <div data-lh-main-frame className={cn("mx-auto w-full", isHomeSurface ? "max-w-none" : "max-w-[1680px]")}>{children}</div>
      </main>
    </div>
  );
}

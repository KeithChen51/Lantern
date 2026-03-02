"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { Header } from "@/components/layout/Header";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "lighthouse-sidebar-pinned";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [isSidebarPinned, setIsSidebarPinned] = React.useState(true);
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
    <div className="min-h-screen bg-paper text-ink font-sans selection:bg-ink/10 selection:text-ink">
      <Navigation
        isPinned={isSidebarPinned}
        onTogglePin={handleTogglePin}
        isMobileOpen={isMobileNavOpen}
        onMobileClose={() => setIsMobileNavOpen(false)}
      />
      <Header
        isSidebarPinned={isSidebarPinned}
        onOpenMobileNav={() => setIsMobileNavOpen(true)}
      />

      <main
        className={cn(
          "pt-24 pr-4 md:pr-8 pb-20 min-h-screen pl-5 transition-[padding] duration-300 ease-in-out",
          isSidebarPinned ? "md:pl-[260px]" : "md:pl-[100px]",
        )}
      >
        {children}
      </main>
    </div>
  );
}

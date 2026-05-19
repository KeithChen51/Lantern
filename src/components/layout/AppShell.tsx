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
    <div className="min-h-screen bg-transparent text-ink font-sans selection:bg-signal-soft selection:text-ink">
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
          "min-h-screen px-4 pb-8 pt-24 transition-[padding] duration-200 ease-out md:px-6",
          isSidebarPinned ? "md:pl-[272px]" : "md:pl-[104px]",
        )}
      >
        <div className="mx-auto w-full max-w-[1680px]">{children}</div>
      </main>
    </div>
  );
}

"use client";

import * as React from "react";
import { Navigation } from "@/components/layout/Navigation";
import { Header } from "@/components/layout/Header";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "lighthouse-sidebar-pinned";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  // Initialize with true (default expanded), then sync with localStorage
  const [isSidebarPinned, setIsSidebarPinned] = React.useState(true);
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Sync state with localStorage after hydration
  React.useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) {
      setIsSidebarPinned(stored === "true");
    }
    setIsHydrated(true);
  }, []);

  // Persist state changes to localStorage
  const handleTogglePin = () => {
    const newValue = !isSidebarPinned;
    setIsSidebarPinned(newValue);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(newValue));
  };

  const contentPaddingLeft = isSidebarPinned ? 260 : 100;

  return (
    <div className="min-h-screen bg-paper text-ink font-sans selection:bg-ink/10 selection:text-ink">
      <Navigation
        isPinned={isSidebarPinned}
        onTogglePin={handleTogglePin}
      />
      <Header />

      <main
        className={cn(
          "pt-24 pr-4 md:pr-8 pb-20 min-h-screen transition-[padding] duration-300 ease-in-out",
          "pl-[20px]",
        )}
        style={{
          paddingLeft: `var(--content-padding, ${contentPaddingLeft}px)`
        }}
      >
        <style jsx>{`
          @media (min-width: 768px) {
            main {
              --content-padding: ${contentPaddingLeft}px;
            }
          }
          @media (max-width: 767px) {
            main {
              --content-padding: 20px;
            }
          }
        `}</style>

        {children}
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { Pin, PinOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Heart", subLabel: "本心", icon: "solar:heart-bold", href: "/heart", isDev: true },
  { label: "Mirror", subLabel: "镜鉴", icon: "solar:book-2-bold", href: "/", isDev: false },
  { label: "Action", subLabel: "笃行", icon: "solar:bolt-bold", href: "/action", isDev: true },
  { label: "Hermit", subLabel: "路引", icon: "solar:magic-stick-3-bold", href: "/hermit", isDev: true },
];

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
        "flex items-center p-3 transition-all duration-300 group/logo",
        !isExpanded && "justify-center",
      )}
    >
      <div className="relative flex h-6 w-6 items-center justify-center">
        <div
          className={cn(
            "absolute h-10 w-10 rounded-xl bg-ink/5 transition-all duration-300 group-hover/logo:bg-amber/10",
            !isExpanded && "h-12 w-12",
          )}
        />
        <Icon
          icon="game-icons:lighthouse"
          className="z-10 h-6 w-6 text-amber drop-shadow-[0_0_5px_rgba(217,119,6,0.3)] transition-all group-hover/logo:drop-shadow-[0_0_8px_rgba(217,119,6,0.6)]"
        />
      </div>
      {isExpanded && (
        <span className="ml-3 font-serif text-2xl font-bold tracking-tight text-amber transition-colors duration-300">
          Lighthouse
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
  return NAV_ITEMS.map((item) => {
    const isActive = isItemActive(pathname, item.href);

    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "group relative flex items-center rounded-lg p-3 transition-all duration-300",
          isActive
            ? "bg-amber/5 text-amber shadow-[0_0_15px_rgba(217,119,6,0.1)]"
            : "text-ink/60 hover:bg-ink/5 hover:text-ink",
        )}
        title={item.isDev ? "开发中，灯火待点亮" : ""}
      >
        <Icon
          icon={item.icon}
          className={cn(
            "h-6 w-6 transition-all duration-300",
            isActive ? "text-amber drop-shadow-[0_0_8px_rgba(217,119,6,0.5)]" : "opacity-100",
          )}
        />
        {isExpanded && (
          <div
            className={cn(
              "ml-3 flex items-baseline gap-2 font-noto transition-colors duration-300",
              isActive ? "text-amber" : "text-ink",
            )}
          >
            <span className="text-sm font-bold leading-none tracking-wide">{item.subLabel}</span>
            <span
              className={cn(
                "text-xs font-semibold opacity-60",
                isActive ? "text-amber" : "text-ink",
              )}
            >
              {item.label}
            </span>
          </div>
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
        style={{ width: isExpanded ? "240px" : "80px" }}
        className="fixed left-0 top-0 z-50 hidden h-screen flex-col border-r border-[rgba(0,0,0,0.05)] bg-paper py-8 shadow-sm backdrop-blur-sm transition-[width] duration-300 ease-in-out md:flex"
      >
        <div className="mb-12 px-4">
          <Logo isExpanded={isExpanded} />
        </div>

        <div className="flex flex-1 flex-col gap-2 px-4">
          <NavLinks isExpanded={isExpanded} pathname={pathname} />
        </div>

        <div className="mt-auto px-4">
          <button
            type="button"
            onClick={onTogglePin}
            className={cn(
              "flex w-full items-center rounded-lg p-3 text-sm transition-colors",
              isPinned ? "bg-ink/5 text-ink" : "text-ink/40 hover:bg-ink/5 hover:text-ink",
              !isExpanded && "justify-center",
            )}
          >
            {isPinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            {isExpanded && (
              <span className="ml-3 font-serif">{isPinned ? "Unpin Sidebar" : "Pin Sidebar"}</span>
            )}
          </button>
        </div>
      </nav>

      <div
        className={cn(
          "fixed inset-0 z-50 bg-ink/20 backdrop-blur-[1px] transition-opacity duration-300 md:hidden",
          isMobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          onClick={onMobileClose}
          aria-label="关闭导航菜单"
          className="absolute inset-0"
        />
        <nav
          className={cn(
            "absolute left-0 top-0 flex h-full w-72 flex-col border-r border-[rgba(0,0,0,0.08)] bg-paper py-6 shadow-xl transition-transform duration-300",
            isMobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-8 flex items-center justify-between px-4">
            <Logo isExpanded />
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-md p-2 text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
              aria-label="关闭导航菜单"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2 px-4">
            <NavLinks isExpanded pathname={pathname} onNavigate={onMobileClose} />
          </div>
        </nav>
      </div>
    </>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { Pin, PinOff } from "lucide-react";
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
}

export function Navigation({ isPinned, onTogglePin }: NavigationProps) {
    const pathname = usePathname();

    // isExpanded is now only controlled by isPinned, no hover
    const isExpanded = isPinned;

    // Determine if a nav item is active based on current pathname
    const isItemActive = (href: string) => {
        if (href === "/") {
            return pathname === "/";
        }
        return pathname.startsWith(href);
    };

    return (
        <nav
            style={{ width: isExpanded ? "240px" : "80px" }}
            className="fixed left-0 top-0 h-screen bg-paper border-r border-[rgba(0,0,0,0.05)] z-50 flex flex-col py-8 shadow-sm transition-[width] duration-300 ease-in-out backdrop-blur-sm"
        >
            <div className="px-4 mb-12">
                <Link
                    href="/"
                    className={cn(
                        "flex items-center p-3 transition-all duration-300 group/logo",
                        !isExpanded && "justify-center"
                    )}
                >
                    <div className="w-6 h-6 flex items-center justify-center relative">
                        {/* Decorative background box that doesn't affect layout alignment */}
                        <div className={cn(
                            "absolute w-10 h-10 rounded-xl bg-ink/5 transition-all duration-300 group-hover/logo:bg-amber/10",
                            !isExpanded && "w-12 h-12"
                        )} />
                        <Icon
                            icon="game-icons:lighthouse"
                            className="w-6 h-6 text-amber drop-shadow-[0_0_5px_rgba(217,119,6,0.3)] group-hover/logo:drop-shadow-[0_0_8px_rgba(217,119,6,0.6)] transition-all z-10"
                        />
                    </div>
                    {isExpanded && (
                        <span className="ml-3 font-serif text-2xl font-bold tracking-tight text-amber transition-colors duration-300">
                            Lighthouse
                        </span>
                    )}
                </Link>
            </div>

            <div className="flex-1 flex flex-col gap-2 px-4">
                {NAV_ITEMS.map((item) => {
                    const isActive = isItemActive(item.href);
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={cn(
                                "group flex items-center p-3 rounded-lg transition-all duration-300 relative",
                                isActive
                                    ? "bg-amber/5 text-amber shadow-[0_0_15px_rgba(217,119,6,0.1)]"
                                    : "text-ink/60 hover:text-ink hover:bg-ink/5"
                            )}
                            title={item.isDev ? "开发中，灯火待点亮" : ""}
                        >
                            <Icon
                                icon={item.icon}
                                className={cn(
                                    "w-6 h-6 transition-all duration-300",
                                    isActive ? "text-amber drop-shadow-[0_0_8px_rgba(217,119,6,0.5)]" : "opacity-100"
                                )}
                            />
                            {isExpanded && (
                                <div className={cn(
                                    "ml-3 flex items-baseline gap-2 font-noto transition-colors duration-300",
                                    isActive ? "text-amber" : "text-ink"
                                )}>
                                    <span className="text-sm font-bold leading-none tracking-wide">
                                        {item.subLabel}
                                    </span>
                                    <span className={cn(
                                        "text-xs font-semibold opacity-60",
                                        isActive ? "text-amber" : "text-ink"
                                    )}>
                                        {item.label}
                                    </span>
                                </div>
                            )}

                            {/* Removed dots as per user request */}
                        </Link>
                    );
                })}
            </div>

            <div className="px-4 mt-auto">
                <button
                    onClick={onTogglePin}
                    className={cn(
                        "w-full flex items-center p-3 rounded-lg transition-colors text-sm",
                        isPinned
                            ? "text-ink bg-ink/5"
                            : "text-ink/40 hover:text-ink hover:bg-ink/5",
                        !isExpanded && "justify-center"
                    )}
                >
                    {isPinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
                    {isExpanded && (
                        <span className="ml-3 font-serif">{isPinned ? "Unpin Sidebar" : "Pin Sidebar"}</span>
                    )}
                </button>
            </div>
        </nav>
    );
}

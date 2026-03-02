"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const SEARCH_TARGETS = [
  { href: "/", label: "镜鉴 Mirror", keywords: ["mirror", "镜鉴", "首页", "案例"] },
  { href: "/heart", label: "本心 Heart", keywords: ["heart", "本心", "价值观", "文化"] },
  { href: "/action", label: "笃行 Action", keywords: ["action", "笃行", "行动", "实践"] },
  { href: "/hermit", label: "路引 Hermit", keywords: ["hermit", "路引", "决策", "对话"] },
];

const NOTIFICATIONS = [
  "诊断项已接入：代码质量、性能、移动端适配。",
  "当前可搜索页面：镜鉴、本心、笃行、路引。",
  "下一步建议：将大图压缩为 WebP 进一步提速。",
];

interface HeaderProps {
  isSidebarPinned: boolean;
  onOpenMobileNav: () => void;
}

export function Header({ isSidebarPinned, onOpenMobileNav }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [searchFeedback, setSearchFeedback] = React.useState("");
  const [isNotificationOpen, setIsNotificationOpen] = React.useState(false);

  React.useEffect(() => {
    setIsNotificationOpen(false);
    setSearchFeedback("");
  }, [pathname]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      setSearchFeedback("请输入关键词，如：镜鉴、本心、笃行、路引。");
      return;
    }

    const matchedTarget = SEARCH_TARGETS.find((target) =>
      target.keywords.some((keyword) => {
        const normalizedKeyword = keyword.toLowerCase();
        return normalizedKeyword.includes(normalizedQuery) || normalizedQuery.includes(normalizedKeyword);
      }),
    );

    if (!matchedTarget) {
      setSearchFeedback("未找到匹配页面，可尝试：镜鉴 / 本心 / 笃行 / 路引。");
      return;
    }

    router.push(matchedTarget.href);
    setSearchFeedback(`已跳转到 ${matchedTarget.label}。`);
  };

  return (
    <header
      className={cn(
        "pointer-events-none fixed left-0 right-0 top-0 z-40 h-20 bg-gradient-to-b from-paper via-paper/85 to-transparent pl-4 pr-4 md:pr-8",
        isSidebarPinned ? "md:pl-[260px]" : "md:pl-[100px]",
      )}
    >
      <div className="pointer-events-auto mx-auto flex h-full w-full max-w-7xl items-center justify-end gap-4 md:gap-6">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="打开导航菜单"
          className="mr-auto rounded-full p-2 text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <form onSubmit={handleSearchSubmit} className="w-full max-w-md">
          <div className="group relative">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <Search className="h-4 w-4 text-ink/40 transition-colors group-focus-within:text-ink" />
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="text"
              placeholder="搜索页面（如：镜鉴、路引）"
              className="w-full rounded-full border border-transparent bg-ink/5 py-2.5 pl-10 pr-4 text-sm text-ink shadow-sm outline-none transition-all duration-300 placeholder:text-ink/30 hover:bg-ink/10 focus:border-ink/10 focus:bg-white/50"
            />
          </div>
          {searchFeedback && (
            <p className="mt-2 pl-2 text-xs text-ink/50">{searchFeedback}</p>
          )}
        </form>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsNotificationOpen((prev) => !prev)}
            className="relative rounded-full p-2 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
            aria-label="通知"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-paper bg-red-400" />
          </button>

          {isNotificationOpen && (
            <div className="absolute right-0 top-12 w-72 rounded-xl border border-white/60 bg-white/80 p-4 text-sm text-ink/70 shadow-lg backdrop-blur-sm">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber">通知</p>
              <ul className="space-y-2">
                {NOTIFICATIONS.map((item) => (
                  <li key={item} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

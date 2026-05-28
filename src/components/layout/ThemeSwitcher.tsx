"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const THEME_STORAGE_KEY = "lighthouse-app-theme";
const THEME_DATA_ATTRIBUTE = "data-lighthouse-theme";

const THEMES = [
  { id: "harbor", label: "蓝绿", title: "港湾蓝绿" },
  { id: "amber", label: "琥珀金", title: "方案 A · 象牙香槟金" },
] as const;

type LighthouseTheme = (typeof THEMES)[number]["id"];

function isLighthouseTheme(value: string | null): value is LighthouseTheme {
  return value === "harbor" || value === "amber";
}

function applyTheme(theme: LighthouseTheme) {
  document.documentElement.setAttribute(THEME_DATA_ATTRIBUTE, theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function ThemeSwitcher() {
  const [theme, setTheme] = React.useState<LighthouseTheme>("harbor");

  React.useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const currentTheme = document.documentElement.getAttribute(THEME_DATA_ATTRIBUTE);
    const nextTheme = isLighthouseTheme(storedTheme)
      ? storedTheme
      : isLighthouseTheme(currentTheme)
        ? currentTheme
        : "harbor";

    applyTheme(nextTheme);
    setTheme(nextTheme);
  }, []);

  return (
    <div
      className="flex shrink-0 items-center rounded-sm border border-line bg-surface-quiet p-1 shadow-lh-sm"
      aria-label="配色方案"
    >
      {THEMES.map((option) => {
        const isActive = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            title={option.title}
            aria-pressed={isActive}
            onClick={() => {
              applyTheme(option.id);
              setTheme(option.id);
            }}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center rounded-xs px-2.5 text-xs font-bold transition-colors",
              isActive ? "bg-primary text-panel shadow-lh-sm" : "text-muted hover:bg-panel hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

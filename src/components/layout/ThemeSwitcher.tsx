"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const THEME_STORAGE_KEY = "lighthouse-app-theme-v2";
const TYPEFACE_STORAGE_KEY = "lighthouse-app-typeface";
const THEME_DATA_ATTRIBUTE = "data-lighthouse-theme";
const TYPEFACE_DATA_ATTRIBUTE = "data-lighthouse-typeface";

const THEMES = [
  { id: "truth", label: "求真", shortLabel: "求", title: "求真 · Glass Lab", swatch: "#2f7d80" },
  { id: "goodness", label: "尽善", shortLabel: "善", title: "尽善 · Willow Porcelain", swatch: "#647d5d" },
  { id: "beauty", label: "致美", shortLabel: "美", title: "致美 · Porcelain Iris", swatch: "#806c9f" },
  { id: "love", label: "大爱", shortLabel: "爱", title: "大爱 · Pomegranate Cotton", swatch: "#c74f5a" },
  { id: "happiness", label: "幸福", shortLabel: "幸", title: "幸福 · Daybreak Peach", swatch: "#d97957" },
] as const;

const TYPEFACES = [
  { id: "hei", label: "黑体", shortLabel: "黑", title: "现代黑体正文" },
  { id: "wenkai", label: "文楷", shortLabel: "楷", title: "霞鹜文楷正文" },
] as const;

type LighthouseTheme = (typeof THEMES)[number]["id"];
type LighthouseTypeface = (typeof TYPEFACES)[number]["id"];

function isLighthouseTheme(value: string | null): value is LighthouseTheme {
  return THEMES.some((option) => option.id === value);
}

function isLighthouseTypeface(value: string | null): value is LighthouseTypeface {
  return TYPEFACES.some((option) => option.id === value);
}

function applyTheme(theme: LighthouseTheme) {
  document.documentElement.setAttribute(THEME_DATA_ATTRIBUTE, theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function applyTypeface(typeface: LighthouseTypeface) {
  document.documentElement.setAttribute(TYPEFACE_DATA_ATTRIBUTE, typeface);
  localStorage.setItem(TYPEFACE_STORAGE_KEY, typeface);
}

export function ThemeSwitcher() {
  const [theme, setTheme] = React.useState<LighthouseTheme>("truth");
  const [typeface, setTypeface] = React.useState<LighthouseTypeface>("hei");

  React.useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const currentTheme = document.documentElement.getAttribute(THEME_DATA_ATTRIBUTE);
    const nextTheme = isLighthouseTheme(storedTheme)
      ? storedTheme
      : isLighthouseTheme(currentTheme)
        ? currentTheme
        : "truth";

    const storedTypeface = localStorage.getItem(TYPEFACE_STORAGE_KEY);
    const currentTypeface = document.documentElement.getAttribute(TYPEFACE_DATA_ATTRIBUTE);
    const nextTypeface = isLighthouseTypeface(storedTypeface)
      ? storedTypeface
      : isLighthouseTypeface(currentTypeface)
        ? currentTypeface
        : "hei";

    localStorage.removeItem("lighthouse-app-theme");
    applyTheme(nextTheme);
    applyTypeface(nextTypeface);
    setTheme(nextTheme);
    setTypeface(nextTypeface);
  }, []);

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-sm border border-line bg-surface-quiet p-1 shadow-lh-sm" aria-label="主题与字体">
      <div className="flex items-center gap-0.5" role="group" aria-label="价值主题">
        {THEMES.map((option) => {
          const isActive = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-theme-choice={option.id}
              title={option.title}
              aria-pressed={isActive}
              onClick={() => {
                applyTheme(option.id);
                setTheme(option.id);
              }}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-xs px-1.5 text-xs font-bold transition-[background,color,box-shadow] xl:px-2",
                isActive ? "bg-primary text-panel shadow-lh-sm" : "text-muted hover:bg-panel hover:text-ink",
              )}
            >
              <span className="h-2 w-2 rounded-full border border-line bg-[var(--theme-swatch)]" style={{ "--theme-swatch": option.swatch } as React.CSSProperties} />
              <span className="xl:hidden">{option.shortLabel}</span>
              <span className="hidden xl:inline">{option.label}</span>
            </button>
          );
        })}
      </div>

      <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />

      <div className="flex items-center gap-0.5" role="group" aria-label="正文字体">
        {TYPEFACES.map((option) => {
          const isActive = typeface === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-typeface-choice={option.id}
              title={option.title}
              aria-pressed={isActive}
              onClick={() => {
                applyTypeface(option.id);
                setTypeface(option.id);
              }}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-xs px-1.5 text-xs font-bold transition-[background,color,box-shadow] xl:px-2",
                isActive ? "bg-ink text-panel shadow-lh-sm" : "text-muted hover:bg-panel hover:text-ink",
              )}
            >
              <span className="xl:hidden">{option.shortLabel}</span>
              <span className="hidden xl:inline">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  INTERFACE_DATA_ATTRIBUTE,
  INTERFACE_MODES,
  INTERFACE_STORAGE_KEY,
  THEME_DATA_ATTRIBUTE,
  THEME_STORAGE_KEY,
  TYPEFACE_DATA_ATTRIBUTE,
  TYPEFACE_STORAGE_KEY,
  isLighthouseInterface,
  type LighthouseInterface,
} from "@/components/layout/appearance-mode";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "truth", label: "求真", shortLabel: "真", title: "求真 · Glass Lab", swatch: "#6ab0a5" },
  { id: "goodness", label: "尽善", shortLabel: "善", title: "尽善 · Willow Porcelain", swatch: "#728a69" },
  { id: "beauty", label: "致美", shortLabel: "美", title: "致美 · Porcelain Iris", swatch: "#806c9f" },
  { id: "love", label: "大爱", shortLabel: "爱", title: "大爱 · Pomegranate Cotton", swatch: "#c74f5a" },
  { id: "happiness", label: "幸福", shortLabel: "福", title: "幸福 · Daybreak Peach", swatch: "#f1a77d" },
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

function applyInterfaceMode(mode: LighthouseInterface) {
  document.documentElement.setAttribute(INTERFACE_DATA_ATTRIBUTE, mode);
  localStorage.setItem(INTERFACE_STORAGE_KEY, mode);
}

export function ThemeSwitcher() {
  const [theme, setTheme] = React.useState<LighthouseTheme>("truth");
  const [typeface, setTypeface] = React.useState<LighthouseTypeface>("hei");
  const [interfaceMode, setInterfaceMode] = React.useState<LighthouseInterface>("modern");

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

    const storedInterfaceMode = localStorage.getItem(INTERFACE_STORAGE_KEY);
    const currentInterfaceMode = document.documentElement.getAttribute(INTERFACE_DATA_ATTRIBUTE);
    const nextInterfaceMode = isLighthouseInterface(storedInterfaceMode)
      ? storedInterfaceMode
      : isLighthouseInterface(currentInterfaceMode)
        ? currentInterfaceMode
        : "modern";

    localStorage.removeItem("lighthouse-app-theme");
    applyTheme(nextTheme);
    applyTypeface(nextTypeface);
    applyInterfaceMode(nextInterfaceMode);
    setTheme(nextTheme);
    setTypeface(nextTypeface);
    setInterfaceMode(nextInterfaceMode);
  }, []);

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1 rounded-[var(--lh-card-radius)] border border-line bg-surface-quiet p-1 shadow-[var(--lh-card-shadow)]"
      aria-label="主题、字体与界面"
    >
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
                "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-[var(--lh-control-radius)] px-1.5 text-xs font-bold transition-[background,color,box-shadow] xl:px-2",
                isActive ? "bg-primary text-panel shadow-[var(--lh-card-shadow)]" : "text-muted hover:bg-panel hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full border",
                  isActive ? "border-panel/75 bg-panel shadow-[0_0_0_1px_rgba(255,255,255,0.34)]" : "border-line bg-[var(--theme-swatch)]",
                )}
                style={{ "--theme-swatch": option.swatch } as React.CSSProperties}
              />
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
                "inline-flex h-8 min-w-8 items-center justify-center rounded-[var(--lh-control-radius)] px-1.5 text-xs font-bold transition-[background,color,box-shadow] xl:px-2",
                isActive ? "bg-ink text-panel shadow-[var(--lh-card-shadow)]" : "text-muted hover:bg-panel hover:text-ink",
              )}
            >
              <span className="xl:hidden">{option.shortLabel}</span>
              <span className="hidden xl:inline">{option.label}</span>
            </button>
          );
        })}
      </div>

      <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />

      <div className="flex items-center gap-0.5" role="group" aria-label="界面模式">
        {INTERFACE_MODES.map((option) => {
          const isActive = interfaceMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-interface-choice={option.id}
              title={option.title}
              aria-pressed={isActive}
              onClick={() => {
                applyInterfaceMode(option.id);
                setInterfaceMode(option.id);
              }}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-[var(--lh-control-radius)] px-1.5 text-xs font-bold transition-[background,color,box-shadow] xl:px-2",
                isActive ? "bg-action text-panel shadow-[var(--lh-card-shadow)]" : "text-muted hover:bg-panel hover:text-ink",
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

export const THEME_STORAGE_KEY = "lighthouse-app-theme-v2";
export const TYPEFACE_STORAGE_KEY = "lighthouse-app-typeface";
export const INTERFACE_STORAGE_KEY = "lighthouse-app-interface";

export const THEME_DATA_ATTRIBUTE = "data-lighthouse-theme";
export const TYPEFACE_DATA_ATTRIBUTE = "data-lighthouse-typeface";
export const INTERFACE_DATA_ATTRIBUTE = "data-lighthouse-interface";

export const INTERFACE_MODES = [
  { id: "modern", label: "现代", shortLabel: "今", title: "现代界面" },
  { id: "classic", label: "经典", shortLabel: "旧", title: "Classic Amber 旧版界面" },
] as const;

export type LighthouseInterface = (typeof INTERFACE_MODES)[number]["id"];

export function isLighthouseInterface(value: string | null): value is LighthouseInterface {
  return INTERFACE_MODES.some((option) => option.id === value);
}

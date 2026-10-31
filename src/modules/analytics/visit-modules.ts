export const VISIT_MODULES = {
  heart: "本心", mirror: "镜鉴", action: "笃行", games: "启航",
  hermit: "路引", search: "搜索", me: "我的", updates: "版本消息",
} as const;

export type VisitModule = keyof typeof VISIT_MODULES;

export function visitModuleForPath(pathname: string): VisitModule | null {
  if (pathname === "/" || pathname === "/heart" || pathname.startsWith("/heart/")) return "heart";
  for (const targetModule of Object.keys(VISIT_MODULES) as VisitModule[]) {
    if (pathname === `/${targetModule}` || pathname.startsWith(`/${targetModule}/`)) return targetModule;
  }
  return null;
}

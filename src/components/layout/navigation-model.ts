import { lighthouseIcons, type LighthouseIcon } from "@/components/ui/lighthouse-icons";
import { isGamesModuleEnabled } from "@/config/features";

export type NavItem = {
  label: string;
  subLabel: string;
  icon: LighthouseIcon;
  href: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "价值起点", subLabel: "本心", icon: lighthouseIcons.heart, href: "/" },
  { label: "外部标杆", subLabel: "镜鉴", icon: lighthouseIcons.mirror, href: "/mirror" },
  { label: "内部实践", subLabel: "笃行", icon: lighthouseIcons.action, href: "/action" },
  { label: "文化游戏", subLabel: "启航", icon: lighthouseIcons.arrowRightUp, href: "/games" },
  { label: "AI问答", subLabel: "路引", icon: lighthouseIcons.hermit, href: "/hermit" },
];

export function getVisibleNavItems(role?: "normal_user" | "highest_admin" | null) {
  void role;
  return NAV_ITEMS.filter((item) => item.href !== "/games" || isGamesModuleEnabled());
}

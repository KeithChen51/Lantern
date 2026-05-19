export type NavItem = {
  label: string;
  subLabel: string;
  icon: string;
  href: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "价值起点", subLabel: "本心", icon: "solar:heart-bold", href: "/" },
  { label: "标杆案例", subLabel: "镜鉴", icon: "solar:book-2-bold", href: "/mirror" },
  { label: "判断训练", subLabel: "笃行", icon: "solar:bolt-bold", href: "/action" },
  { label: "岗位共创", subLabel: "共创", icon: "solar:clipboard-check-bold", href: "/workshop" },
  { label: "服务路引", subLabel: "路引", icon: "solar:magic-stick-3-bold", href: "/hermit" },
];

export function getVisibleNavItems(role?: "normal_user" | "highest_admin" | null) {
  void role;
  return NAV_ITEMS;
}

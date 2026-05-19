export type NavItem = {
  label: string;
  subLabel: string;
  icon: string;
  href: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Heart", subLabel: "本心", icon: "solar:heart-bold", href: "/" },
  { label: "Mirror", subLabel: "镜鉴", icon: "solar:book-2-bold", href: "/mirror" },
  { label: "Action", subLabel: "笃行", icon: "solar:bolt-bold", href: "/action" },
  { label: "Workshop", subLabel: "共创", icon: "solar:clipboard-check-bold", href: "/workshop" },
  { label: "Hermit", subLabel: "路引", icon: "solar:magic-stick-3-bold", href: "/hermit" },
];

export function getVisibleNavItems(role?: "normal_user" | "highest_admin" | null) {
  void role;
  return NAV_ITEMS;
}

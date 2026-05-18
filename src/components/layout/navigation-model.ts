export type NavItem = {
  label: string;
  subLabel: string;
  icon: string;
  href: string;
  isDev: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Heart", subLabel: "本心", icon: "solar:heart-bold", href: "/", isDev: true },
  { label: "Mirror", subLabel: "镜鉴", icon: "solar:book-2-bold", href: "/mirror", isDev: false },
  { label: "Action", subLabel: "笃行", icon: "solar:bolt-bold", href: "/action", isDev: true },
  { label: "Workshop", subLabel: "共创", icon: "solar:clipboard-check-bold", href: "/workshop", isDev: false },
  { label: "Hermit", subLabel: "路引", icon: "solar:magic-stick-3-bold", href: "/hermit", isDev: true },
];

export function getVisibleNavItems() {
  return NAV_ITEMS;
}

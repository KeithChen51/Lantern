import type { IconifyIcon } from "@iconify/types";
import { solarIconSet } from "./lighthouse-icon-data";

type SolarIconName = keyof typeof solarIconSet.icons;

function solarIcon(name: SolarIconName): IconifyIcon {
  return {
    width: 24,
    height: 24,
    ...solarIconSet.icons[name],
  };
}

export const lighthouseIcons = {
  logo: solarIcon("map-point-wave-bold"),
  heart: solarIcon("heart-bold"),
  mirror: solarIcon("book-2-bold"),
  action: solarIcon("bolt-bold"),
  workshop: solarIcon("clipboard-check-bold"),
  hermit: solarIcon("magic-stick-3-bold"),
  search: solarIcon("magnifer-bold-duotone"),
  send: solarIcon("plain-bold"),
  edit: solarIcon("pen-2-bold"),
  delete: solarIcon("trash-bin-trash-bold"),
  publish: solarIcon("upload-square-bold"),
  reject: solarIcon("undo-left-round-bold"),
  save: solarIcon("diskette-bold"),
  close: solarIcon("close-circle-bold"),
  pin: solarIcon("pin-bold"),
  unpin: solarIcon("pin-circle-bold"),
  collapseSidebar: solarIcon("round-double-alt-arrow-left-bold-duotone"),
  expandSidebar: solarIcon("round-double-alt-arrow-right-bold-duotone"),
  menu: solarIcon("sidebar-minimalistic-bold"),
  bell: solarIcon("bell-bold"),
  more: solarIcon("menu-dots-bold"),
  refresh: solarIcon("refresh-bold"),
  add: solarIcon("add-circle-bold"),
  document: solarIcon("document-text-bold"),
  status: solarIcon("check-circle-bold"),
  warning: solarIcon("danger-triangle-bold"),
  info: solarIcon("info-circle-bold"),
  admin: solarIcon("shield-check-bold"),
  user: solarIcon("user-rounded-bold"),
  cupStar: solarIcon("cup-star-bold"),
  arrowRightUp: solarIcon("arrow-right-up-bold"),
  clock: solarIcon("clock-circle-bold"),
} as const;

export type LighthouseIconName = keyof typeof lighthouseIcons;
export type LighthouseIcon = (typeof lighthouseIcons)[LighthouseIconName];

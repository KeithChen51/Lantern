import type { PublicationAudience } from "@/modules/wecom-publications/contracts";

const beijingFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function beijingTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间不可用" : beijingFormatter.format(date);
}

export function beijingSchedule(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("请选择发送时间。");
  const iso = `${value}:00+08:00`;
  const date = new Date(iso);
  const parts = Object.fromEntries(beijingFormatter.formatToParts(date).map(part => [part.type, part.value]));
  if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` !== value) {
    throw new Error("请选择有效的发送时间。");
  }
  return iso;
}

export function parseAudienceIds(value: string): string[] {
  return [...new Set(value.split(/[\s,，;；|]+/).map(id => id.trim()).filter(Boolean))];
}

export function audienceLabel(audience: PublicationAudience): string {
  if (audience.kind === "all") return "应用全员（以发送时应用可见范围为准）";
  return `${audience.kind === "members" ? "成员" : "部门"} · ${audience.ids.join("、")}`;
}

export function previewDocument(html: string, dark: boolean): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>:root{color-scheme:${dark ? "dark" : "light"}}body{margin:0;padding:16px 0;background:${dark ? "#181818" : "#ffffff"};color:${dark ? "#eeeeee" : "#242424"};font:16px/1.75 sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${html}</body></html>`;
}

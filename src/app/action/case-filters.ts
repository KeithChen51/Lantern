import type { PublicActionCaseSummary } from "./public-action-cases";

export function filterActionCases(cases: PublicActionCaseSummary[], query: string, tag: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return cases.filter(item => (!tag || item.tags.includes(tag)) && terms.every(term => `${item.title} ${item.summary} ${item.question} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(term)));
}
export function actionCaseTags(cases: PublicActionCaseSummary[]) {
  const counts = new Map<string, number>();
  for (const item of cases) for (const tag of new Set(item.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
}

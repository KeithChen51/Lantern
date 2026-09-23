export function plainMarkdown(value: string) {
  return value.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim();
}
export function articleOutline(markdown: string) {
  let fence = "";
  let titleLine: number | null = null;
  const headings: { line: number; depth: number; text: string; id: string }[] = [];
  markdown.split("\n").forEach((line, index) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) { if (!fence) fence = marker[1][0]; else if (fence === marker[1][0]) fence = ""; return; }
    if (fence) return;
    const match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    if (!headings.length && titleLine === null && match[1].length === 1) { titleLine = index + 1; return; }
    headings.push({ line: index + 1, depth: match[1].length, text: plainMarkdown(match[2]), id: `section-${index + 1}` });
  });
  return { titleLine, headings: headings.filter(h => h.depth <= 3) };
}
export function resourceSourceLabel(source: string) {
  if (source.startsWith("docs/brand/")) return "精诚服务 · 品牌文档";
  if (source.startsWith("docs/content/action-canwu-cases/")) return "精诚服务 · 实践案例";
  if (source.startsWith("src/lib/hermit/knowledge/")) return "灯塔 · 知识资料";
  if (source.includes("/") || source.includes("\\")) return source.split(/[\\/]/).at(-1)?.replace(/\.md$/i, "") || "资料来源";
  return source;
}

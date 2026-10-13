import { parseDocument } from "yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { lint } from "markdownlint/promise";
import { identifier, metadataSchema, sections } from "./schema.mjs";

const parser = unified().use(remarkParse).use(remarkGfm);
const placeholder = /^(?:待补(?:充)?|待确认|未知|不详|unknown|TODO|TBD|填写.+|示例来源)$/i;
function plain(node) { return node.value ?? (node.children ?? []).map(plain).join(""); }
function walk(node, visit) { visit(node); for (const child of node.children ?? []) walk(child, visit); }

export async function validate(text, { id } = {}) {
  const issues = [];
  const add = (severity, code, message, line = 1) => issues.push({ severity, code, line, message });
  const result = (metadata = null, body = null, request = null) => ({
    protocolVersion: 1, ready: !issues.some(x => x.severity === "error"),
    issues, metadata, body, request,
    linkAccessibility: "not_checked", factsVerified: false,
  });
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("---\n")) {
    add("error", "frontmatter", "文档必须以 YAML frontmatter 开始"); return result();
  }
  const lines = text.split("\n");
  const end = lines.findIndex((line, i) => i > 0 && line === "---");
  if (end < 0) { add("error", "frontmatter", "YAML frontmatter 缺少结束分隔符"); return result(); }
  const yaml = parseDocument(lines.slice(1, end).join("\n"), { uniqueKeys: true });
  for (const issue of yaml.errors) add("error", "yaml", issue.message, (issue.linePos?.[0]?.line ?? 1) + 1);
  if (yaml.errors.length) return result();
  let raw;
  try { raw = yaml.toJS({ maxAliasCount: 20 }); }
  catch { add("error", "yaml", "YAML 别名展开失败或过多"); return result(); }
  const parsed = metadataSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) add("error", "metadata", `${issue.path.join(".") || "frontmatter"}: ${issue.message}`);
  }
  const meta = parsed.success ? parsed.data : null;
  if (meta) {
    for (const key of ["title", "source", "summary"]) {
      if (placeholder.test(meta[key])) add("error", "placeholder", `${key} 仍是占位内容`);
    }
    if (id && meta.id && id !== meta.id) add("error", "id_conflict", "--id 与文档 id 不一致，不自动改名或覆盖");
  }
  if (id && !identifier.safeParse(id).success) add("error", "id", "--id 不符合中台资源编号规则");
  const body = lines.slice(end + 1).join("\n");
  const offset = end + 1;
  if (!body.trim() || body.length > 2_000_000) add("error", "body", "正文不能为空且不能超过 200 万字符", offset + 1);
  const tree = parser.parse(body);
  const headings = tree.children.filter(n => n.type === "heading");
  const anchors = new Set(["#resource-top", ...headings.filter(n => n.depth === 2 || n.depth === 3).map(n => `#section-${n.position.start.line}`)]);
  const h1 = headings.filter(n => n.depth === 1);
  if (h1.length !== 1) add("warning", "h1", "建议保留一个一级标题", offset + 1);
  if (meta && h1.length === 1 && plain(h1[0]) !== meta.title) add("warning", "title", "一级标题与元信息 title 不一致", offset + h1[0].position.start.line);
  if (meta) {
    for (const section of sections[meta.type]) {
      const index = tree.children.findIndex(n => n.type === "heading" && n.depth === 2 && plain(n) === section);
      if (index < 0) { add("error", "section", `缺少二级章节：${section}`, offset + 1); continue; }
      const next = tree.children.findIndex((n, i) => i > index && n.type === "heading" && n.depth <= 2);
      const contents = tree.children.slice(index + 1, next < 0 ? undefined : next);
      if (!contents.some(n => plain(n).trim())) add("error", "section_empty", `章节为空：${section}`, offset + tree.children[index].position.start.line);
    }
  }
  walk(tree, node => {
    const line = offset + (node.position?.start.line ?? 1);
    if (node.type === "text" && /(?:待补充|待确认|\bTODO\b|\bTBD\b)/i.test(node.value)) add("warning", "pending", "正文存在待补信息；确认后再导入", line);
    if (node.type === "text" && /!?\[\[[^\]]+\]\]/.test(node.value)) add("error", "wikilink", "Obsidian 双链/嵌入不会被灯塔解析，请转成正文或可用链接", line);
    if (node.type === "html") add("error", "html", "正文含 HTML；当前阅读器未启用原始 HTML 渲染，请改为 Markdown", line);
    if (node.type === "code") {
      const sourceLines = body.slice(node.position.start.offset, node.position.end.offset).split("\n");
      // Remove quote/list prefixes only for detecting a fenced block; never rewrite source.
      const opener = sourceLines[0].match(/^(`{3,}|~{3,})/);
      if (opener) {
        const fence = opener[1];
        const closer = new RegExp(`^[\\s>]*${fence[0]}{${fence.length},}\\s*$`);
        if (sourceLines.length < 2 || !closer.test(sourceLines.at(-1))) add("error", "fence", "代码围栏未闭合", line);
      }
      if (node.lang === "mermaid") add("warning", "extension", "当前阅读器将 Mermaid 显示为代码，不渲染图形", line);
    }
    if (["link", "image", "definition"].includes(node.type)) {
      const url = node.url ?? "";
      if (!url) add("error", "link", "链接目标为空", line);
      else if (url.startsWith("#")) {
        if (!anchors.has(url)) add("error", "anchor", "找不到阅读器锚点；使用 section-正文行号（h2/h3）或 resource-top", line);
      }
      else if (!/^(?:https?:\/\/|mailto:)/i.test(url)) add("error", "link", "仅支持 HTTP(S)、mailto 或章节锚点；本地/相对引用不会随 Markdown 上传", line);
    }
  });
  const lintResults = await lint({ strings: { body }, config: {
    default: false, MD001: true, MD005: true, MD007: true, MD012: true,
    MD018: true, MD019: true, MD022: true, MD031: true, MD032: true,
    MD034: true, MD037: true, MD038: true, MD039: true, MD042: true,
    MD045: true, MD052: true, MD053: true, MD055: true, MD056: true,
  } });
  for (const item of lintResults.body) {
    const code = item.ruleNames[0];
    add(["MD042", "MD052", "MD056"].includes(code) ? "error" : "warning", code,
      `${item.ruleDescription}${item.errorDetail ? `: ${item.errorDetail}` : ""}`, offset + item.lineNumber);
  }
  let request = null;
  if (meta && !issues.some(x => x.severity === "error")) {
    const resourceId = meta.id ?? id;
    if (resourceId) {
      const rest = { ...meta };
      delete rest.schemaVersion;
      delete rest.id;
      request = { ...rest, id: resourceId, markdown: body };
    } else add("warning", "id_required_for_export", "导出前使用 --id 指定资源编号；更新必须沿用已有编号");
  }
  return result(meta, body, request);
}

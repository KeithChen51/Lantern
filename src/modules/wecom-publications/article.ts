import { parse, parseFragment, serialize, type DefaultTreeAdapterTypes } from "parse5";
import { AppError } from "@/shared/errors";
import {
  imageMarker, MAX_ARTICLE_BYTES, MAX_PUBLICATION_IMAGES,
  type NewPublicationDraft, type PublicationImage,
} from "./contracts";

const MAX_BODY_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const HTML_NS = "http://www.w3.org/1999/xhtml";
const legacyImage = "__WECOM_BODY_IMAGE__";
const reservedImageMarker = "__LANTERN_WECOM_IMAGE_";
const allowedTags = new Set([
  "a", "abbr", "article", "aside", "b", "blockquote", "br", "caption", "cite", "code", "col", "colgroup",
  "dd", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "i", "img", "kbd", "li", "main", "mark", "ol", "p", "pre", "s", "section", "small",
  "span", "strong", "style", "sub", "sup", "table", "tbody", "td", "th", "thead", "tfoot", "tr", "u", "ul",
]);
const commonAttributes = new Set(["class", "dir", "id", "lang", "style", "title"]);
const dimensionAttributes = new Set(["width", "height", "colspan", "rowspan", "span", "start"]);
type Element = DefaultTreeAdapterTypes.Element;
type Parent = DefaultTreeAdapterTypes.ParentNode;

function invalid(message: string): never {
  throw new AppError("validation_error", message, 422);
}

function fileKey(name: string) {
  return name.normalize("NFC").toLowerCase();
}

function safeCss(css: string, allowFonts = false): boolean {
  const normalized = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutFonts = allowFonts
    ? normalized.replace(/\burl\(\s*(["']?)data:font\/woff2?;base64,[A-Za-z0-9+/]+=*\1\s*\)/gi, "")
    : normalized;
  return !/[\\\u0000-\u0008\u000b\u000e-\u001f]/.test(normalized)
    && !/@import\b|@namespace\b|\b(?:url|image-set|image|src|expression|paint)\s*\(|\b(?:behavior|-moz-binding)\s*:/i.test(withoutFonts);
}

function secureLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function imageReference(value: string, images: readonly PublicationImage[], fileIndex: ReadonlyMap<string, number>): number {
  const source = value.trim();
  if (source === legacyImage) {
    if (images.length === 1) return 0;
    return invalid("白皮书配图占位符需要恰好一张正文配图。");
  }
  if (!source || /^(?:[a-z][a-z\d+.-]*:|[\\/]{2})/i.test(source)) {
    return invalid("正文须引用上传的配图文件。");
  }
  let basename: string;
  try {
    basename = decodeURIComponent(source.split(/[?#]/, 1)[0].split(/[\\/]/).pop() ?? "");
  } catch {
    return invalid("正文配图路径格式无效。");
  }
  const index = fileIndex.get(fileKey(basename));
  if (index === undefined) return invalid("有正文图片缺少同名附件，请核对 HTML 中的引用。");
  return index;
}

function findElement(parent: Parent, name: string): Element | undefined {
  return parent.childNodes.find((node): node is Element => "tagName" in node && node.tagName === name);
}

export function normalizePublicationHtml(original: string, images: readonly PublicationImage[]): string {
  if (original.includes(reservedImageMarker)) return invalid("正文包含保留的图片占位符。");
  const fileIndex = new Map(images.map((image, index) => [fileKey(image.name), index]));
  if (fileIndex.size !== images.length) return invalid("正文配图的文件名不能重复。");
  const seen = new Set<number>();

  function clean(parent: Parent, depth: number) {
    if (depth > 64) return invalid("HTML 结构嵌套过深。");
    parent.childNodes = parent.childNodes.filter(node => {
      if ("value" in node && node.nodeName === "#text") {
        if (node.value.includes(reservedImageMarker)) return invalid("正文包含保留的图片占位符。");
        return true;
      }
      if (!("tagName" in node) || node.namespaceURI !== HTML_NS || !allowedTags.has(node.tagName)) return false;
      if (node.tagName === "style") {
        node.attrs = [];
        return node.childNodes.every(child => "value" in child && safeCss(child.value, true));
      }
      const src = node.tagName === "img" ? node.attrs.find(attribute => attribute.name === "src")?.value : undefined;
      node.attrs = node.attrs.filter(({ name, value, namespace }) => {
        if (value.includes(reservedImageMarker)) return invalid("正文包含保留的图片占位符。");
        if (namespace) return false;
        if (name === "style") return safeCss(value);
        if (name === "href") return node.tagName === "a" && (value.startsWith("#") || secureLink(value));
        if (name === "alt") return node.tagName === "img";
        if (dimensionAttributes.has(name)) return /^\d{1,5}%?$/.test(value);
        return commonAttributes.has(name);
      });
      if (node.tagName === "img") {
        const index = imageReference(src ?? "", images, fileIndex);
        seen.add(index);
        node.attrs.push({ name: "src", value: imageMarker(index) });
      }
      if (node.childNodes.length) clean(node, depth + 1);
      return true;
    });
  }

  const doc = parse(original);
  const html = findElement(doc, "html")!;
  const head = findElement(html, "head")!;
  const body = findElement(html, "body")!;
  head.childNodes = head.childNodes.filter(node => "tagName" in node && node.tagName === "style");
  clean(head, 0);
  clean(body, 0);
  if (seen.size !== images.length) return invalid("部分上传的正文配图没有在 HTML 中引用。");

  const wrapper = parseFragment("<div></div>");
  const article = findElement(wrapper, "div")!;
  article.attrs = body.attrs.filter(({ name, value }) => {
    if (value.includes(reservedImageMarker)) return invalid("正文包含保留的图片占位符。");
    return commonAttributes.has(name) && (name !== "style" || safeCss(value));
  });
  article.childNodes = [...head.childNodes, ...body.childNodes];
  const normalized = serialize(wrapper);
  if (!serialize(body).trim()) return invalid("HTML 正文为空。");
  if (Buffer.byteLength(normalized, "utf8") > MAX_ARTICLE_BYTES) return invalid("HTML 正文超过 666 KiB。");
  return normalized;
}

function field(form: FormData, name: string, max: number, required = false) {
  const values = form.getAll(name);
  if (!values.length && !required) return "";
  if (values.length !== 1 || typeof values[0] !== "string") return invalid("稿件字段格式无效。");
  const value = values[0].trim();
  if (required && !value || Buffer.byteLength(value, "utf8") > max || /[\u0000-\u001f\u007f]/.test(value)) {
    return invalid(name === "title" ? "请填写标题，标题最多 128 字节。" : "稿件字段超过长度限制或含控制字符。");
  }
  return value;
}

function singleFile(form: FormData, name: string) {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] === "string") return invalid(name === "html" ? "请上传一个 HTML 文件。" : "请上传一张封面。");
  return values[0];
}

async function readImage(file: FormDataEntryValue, limit: number): Promise<PublicationImage> {
  if (typeof file === "string" || file.size < 9 || file.size > limit || !/^[^/\\\u0000-\u001f\u007f]{1,200}\.(?:jpe?g|png)$/i.test(file.name)) {
    return invalid("图片须为 JPG 或 PNG，且符合所选素材的大小限制。");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const mimeType = isPng ? "image/png" : "image/jpeg";
  if ((!isPng && !isJpeg) || isPng !== /\.png$/i.test(file.name)) return invalid("图片内容与文件格式不一致。");
  return { name: file.name, mimeType, bytes };
}

export async function parsePublicationDraft(form: FormData): Promise<NewPublicationDraft> {
  const title = field(form, "title", 128, true);
  const digest = field(form, "digest", 512);
  const author = field(form, "author", 64);
  const sourceUrl = field(form, "sourceUrl", 2048);
  if (sourceUrl && !secureLink(sourceUrl)) return invalid("原文链接必须是 HTTPS 地址。");

  const html = singleFile(form, "html");
  if (!/\.html?$/i.test(html.name) || !html.size || html.size > MAX_ARTICLE_BYTES) {
    return invalid("请选择 UTF-8 HTML，正文上限 666 KiB。");
  }
  const imageFiles = form.getAll("images");
  if (imageFiles.length > MAX_PUBLICATION_IMAGES) return invalid("正文配图最多 10 张。");
  let originalHtml: string;
  try {
    originalHtml = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await html.arrayBuffer());
  } catch {
    return invalid("无法以 UTF-8 读取 HTML 文件。");
  }
  const [cover, images] = await Promise.all([
    readImage(singleFile(form, "cover"), MAX_COVER_BYTES),
    Promise.all(imageFiles.map(file => readImage(file, MAX_BODY_IMAGE_BYTES))),
  ]);
  const normalized = normalizePublicationHtml(originalHtml, images);
  return {
    originalHtml,
    article: { title, digest, html: normalized, ...(author ? { author } : {}), ...(sourceUrl ? { sourceUrl } : {}) },
    cover,
    images,
  };
}

function dataUrl(image: PublicationImage) {
  return "data:" + image.mimeType + ";base64," + Buffer.from(image.bytes).toString("base64");
}

export function publicationPreview(draft: NewPublicationDraft) {
  const html = parseFragment(draft.article.html);
  function removeLinks(parent: Parent) {
    for (const node of parent.childNodes) {
      if (!("tagName" in node)) continue;
      if (node.tagName === "a") node.attrs = node.attrs.filter(attribute => attribute.name !== "href");
      removeLinks(node);
    }
  }
  removeLinks(html);
  const document = draft.images.reduce((content, image, index) => content.replaceAll(imageMarker(index), dataUrl(image)), serialize(html));
  return { html: document, cover: dataUrl(draft.cover) };
}

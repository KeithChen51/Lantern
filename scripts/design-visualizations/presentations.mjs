import assert from "node:assert/strict";

function svgAttributeTheme(tokens) {
  const normal = [tokens["--viz-accent-strong"], tokens["--viz-accent"], tokens["--viz-series-secondary"], tokens["--viz-accent-soft"], tokens["--viz-accent-subtle"]];
  const inverse = [tokens["--viz-accent-on-dark-strong"], tokens["--viz-accent-on-dark"], tokens["--viz-accent-on-dark-mid"], tokens["--viz-accent-on-dark-soft"], tokens["--viz-accent-on-dark-subtle"]];
  const shade = value => {
    const hex = typeof value === "string" && value.match(/^#([\da-f]{6})$/i);
    return hex ? [0, 2, 4].reduce((sum, index) => sum + parseInt(hex[1].slice(index, index + 2), 16), 0) / 3 : null;
  };
  const color = (value, dark, role) => {
    const level = shade(value);
    if (level === null) return value;
    if (role === "text") return dark
      ? level > 185 ? tokens["--text-inverse"] : tokens["--viz-accent-on-dark-strong"]
      : level < 115 || level > 232 ? tokens["--text"] : tokens["--text-muted"];
    if (role === "scaffold") return dark ? tokens["--surface-inverse-muted"]
      : level > 185 ? tokens["--border"] : tokens["--border-strong"];
    if (!dark && level > 232) return tokens["--surface"];
    const position = Math.max(0, Math.min(4, Math.round((level - 28) / 53)));
    return dark ? inverse[4 - position] : normal[position];
  };
  window.lhPresentationSvgAttributes = (parent, tag, attributes) => {
    const dark = Boolean(parent.closest(".v3-incidents,.card.dark"));
    const attrs = { ...attributes };
    const text = tag === "text";
    const fillLevel = shade(attrs.fill);
    for (const property of ["fill", "stroke"]) {
      if (!(property in attrs)) continue;
      let role = text ? "text" : "data";
      const level = shade(attrs[property]);
      const guideLine = property === "stroke" && tag === "line" && level >= 140;
      const fineReference = property === "stroke" && Number(attrs["stroke-width"] ?? 1) < 1 && level >= 165;
      const tinyReference = tag === "circle" && Number(attrs.r) <= 1.3 && level >= 165;
      if (!text && (guideLine || fineReference || tinyReference)) role = "scaffold";
      if (property === "stroke" && level > 232 && (text || fillLevel !== null)) {
        attrs[property] = dark ? tokens["--surface-inverse"] : tokens["--surface"];
      } else {
        attrs[property] = color(attrs[property], dark, role);
      }
    }
    if (typeof attrs.style === "string") {
      attrs.style = attrs.style.replace(/stroke:\s*#[\da-f]{6}/gi,
        "stroke:" + (dark ? tokens["--surface-inverse"] : tokens["--surface"]));
    }
    return attrs;
  };
}

function neutralCss(css, tokens) {
  const colors = {
    "1c1c1a": tokens["--text"], "f0efeb": tokens["--surface"], "2a2925": tokens["--text"],
    "2e2d29": tokens["--surface-inverse-muted"], "4a4944": tokens["--text-muted"],
    "55554f": tokens["--text-muted"], "6a6963": tokens["--text-muted"], "8f8e88": tokens["--text-muted"],
    "b0afa9": tokens["--border-strong"], "b3b0a4": tokens["--border-strong"],
    "c6c5bf": tokens["--border"], "c9c7bd": tokens["--border"], "d8d6ce": tokens["--border"],
    "d8d7d1": tokens["--border"], "dcdad2": tokens["--border"], "deddd6": tokens["--border"],
    "e3e2db": tokens["--surface-muted"],
  };
  return css
    .replace(/background:\s*#1c1c1a/gi, "background:" + tokens["--surface-inverse"])
    .replace(/#[\da-f]{6}\b/gi, value => colors[value.slice(1).toLowerCase()] ?? value)
    .replace(/rgba\(\s*28,\s*28,\s*26,\s*([.\d]+)\s*\)/gi, (_, alpha) => {
      const parts = tokens["--surface-inverse"].slice(1).match(/../g).map(value => parseInt(value, 16));
      return "rgba(" + parts.join(",") + "," + alpha + ")";
    });
}

function adaptDocument(source, tokens, { example = false } = {}) {
  let html = source.toString();
  assert.ok(!html.includes("data-lh-presentation-theme"), "Expected the committed Chinese source");
  html = html.replace(/<style(\s[^>]*)?>([\s\S]*?)<\/style>/gi,
    (_, attrs = "", css) => "<style" + attrs + ">" + neutralCss(css, tokens) + "</style>");
  const helper = /const el\s*=\s*\(p,\s*t,\s*a\)\s*=>\s*\{/;
  assert.ok(helper.test(html), "Expected the native SVG element helper");
  html = html.replace(helper, match => match + " a = window.lhPresentationSvgAttributes(p, t, a);");
  const css = [
    "<style data-lh-presentation-style>",
    ":root{--paper:" + tokens["--surface"] + ";--bg:" + tokens["--bg"] + ";--dark:" + tokens["--surface-inverse"] + ";--ink:" + tokens["--text"] + ";--muted:" + tokens["--text-muted"] + ";--faint:" + tokens["--text-soft"] + ";--grid:" + tokens["--border"] + ";--line:" + tokens["--border"] + ";--font-body:var(--font-sans);--font-heading:var(--font-display)}",
    "html,body{background:var(--bg)!important}",
    "body,button,svg text,.slide .eyebrow{font-family:var(--font-body)}",
    ".slide h1,.pagehead h1,.contents-list a>span:first-child{font-family:var(--font-heading)}",
    ".slide,.card{background:var(--paper);color:var(--ink)}",
    ".slide.v3-incidents,.card.dark{background:" + tokens["--surface-inverse"] + ";color:" + tokens["--text-inverse"] + "}",
    ".v3-incidents .incidents-summary,.v3-incidents .incidents-caption,.v3-incidents .incidents-stat>p+p,.v3-incidents .v3-folio,.card.dark .sub,.card.dark .src{color:" + tokens["--viz-accent-on-dark-strong"] + "}",
    ".library-return{background:" + tokens["--surface-inverse"] + ";color:" + tokens["--text-inverse"] + "}",
    "a:focus-visible,button:focus-visible{outline-color:" + tokens["--primary-text"] + "}",
    ".swatch-paper{background:var(--paper)}.swatch-ink{background:" + tokens["--surface-inverse"] + ";color:" + tokens["--text-inverse"] + "}.swatch-muted{background:" + tokens["--text-muted"] + ";color:" + tokens["--text-inverse"] + "}.swatch-guide{background:" + tokens["--border"] + ";color:" + tokens["--text"] + "}",
    "@media print{.slide.v3-incidents,.card.dark{background:" + tokens["--surface-inverse"] + "!important;color:" + tokens["--text-inverse"] + "!important}}",
    "</style>",
  ].join("\n");
  const script = "<script data-lh-presentation-theme>(" + svgAttributeTheme.toString() + ")(" + JSON.stringify(tokens) + ");</script>";
  html = html.replace("</head>", '<link rel="stylesheet" href="../tokens.css">\n' + css + "\n" + script + "\n</head>");
  html = html.replace(/<title>[\s\S]*?<\/title>/, "<title>" + (example ? "科技从业者心态调查 · 灯塔可视化示例" : "灯塔 Classic Amber · 中文图表演示") + "</title>");
  html = html.replace("← 返回中文图表目录", "← 返回灯塔可视化目录");
  // The native decks inline MONO; keep their documented external alternative resolvable too.
  html = html.replaceAll('src="mono-tokens.js"', 'src="../gallery/mono-tokens.js"');
  html = html.replaceAll("黑色轮廓", "深色描边").replaceAll("一个深色刻度", "一个着色刻度");
  return html;
}

function portal() {
  return [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>图表演示 · 灯塔 Classic Amber</title><link rel="icon" href="data:,"><link rel="stylesheet" href="../tokens.css">',
    "<style>*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 var(--font-sans)}main{width:min(100% - 40px,1000px);margin:auto;padding:24px 0 60px}a{color:var(--primary-text);text-underline-offset:4px}a:focus-visible{outline:2px solid var(--primary-text);outline-offset:5px}.back{display:inline-flex;align-items:center;min-height:44px}h1{font:600 clamp(32px,6vw,56px)/1.25 var(--font-display);margin:48px 0 18px}h2{font-size:23px;margin:0 0 12px}p{max-width:760px;color:var(--text-muted)}article{margin-top:32px;padding:28px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface)}article>a{display:inline-flex;align-items:center;min-height:44px;font-size:20px;font-weight:600}@media(max-width:620px){main{width:calc(100% - 32px)}h1{margin-top:32px}article{padding:20px}}</style></head>",
    '<body><main><a class="back" href="../index.html#presentations">← 返回灯塔可视化目录</a><h1>图表与演示</h1>',
    '<article><h2>灯塔自有演示 · 访问与使用周报</h2><p>用六页讲清访问趋势、常用模块和 AI 使用。虚构样例与整页版共用一份数据。</p><a href="../lantern/presentation.html">打开灯塔演示 →</a></article>',
    "<h2 style=\"margin-top:40px\">上游版式参考</h2><p>以下为 Lieflat 的 19 页演示与调查示例，已适配灯塔配色。</p>",
    '<article><h2>中文图表演示模板</h2><p>以真实单位、图例与旁注组织数据，使用琥珀色标记数据重点。</p><a href="presentation.zh.html">打开 19 页演示 →</a></article>',
    '<article><h2>科技从业者调查示例</h2><p>参考长文案和调查叙事的编排。示例包含独立演示数据，制作实际内容时逐项核对并替换数字、结论与来源。</p><a href="lenny-2026-survey.zh.html">打开 19 页调查演示 →</a><br><a href="../examples/lenny-2026-survey.html">查看八张图的完整示例 →</a></article>',
    "</main></body></html>",
  ].join("\n");
}

export function adaptPresentations(files, tokens) {
  for (const key of ["--bg", "--surface", "--surface-inverse", "--text", "--text-inverse", "--viz-accent", "--viz-series-secondary"]) {
    assert.ok(tokens[key], "Missing Classic Amber token " + key);
  }
  for (const name of files.keys()) {
    if (/^presentations\/complete-/.test(name)) files.delete(name);
  }
  for (const name of ["presentations/presentation.zh.html", "presentations/lenny-2026-survey.zh.html", "examples/lenny-2026-survey.html"]) {
    assert.ok(files.has(name), "Missing Chinese presentation input " + name);
    files.set(name, adaptDocument(files.get(name), tokens, { example: name.includes("survey") }));
  }
  files.set("presentations/index.html", portal());
}

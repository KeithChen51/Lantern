import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { engineSeriesColors } from "./colors.mjs";

const reportNames = {
  R01: "侧栏研究简报",
  R02: "年度里程碑",
  R03: "书脊数据海报",
  R04: "运营月报",
  R05: "重点叙事",
  R06: "长期年鉴",
  R07: "调研拼贴",
  R08: "人群数据",
  R09: "数据总览",
  R10: "旅行手记",
  R11: "定尺研究简报",
  R12: "周报速览",
};

const layoutNames = {
  "青瓷侧栏": reportNames.R01,
  "椰林年报": reportNames.R02,
  "编辑部书脊": reportNames.R03,
  "青瓷月报": reportNames.R04,
  "反色高亮": reportNames.R05,
  "椰林深水区": reportNames.R06,
  "椰林集市": reportNames.R07,
  "青瓷峰会": reportNames.R09,
  "椰林慢刊": reportNames.R10,
  "灰阶定尺": reportNames.R11,
  "椰林三秒": reportNames.R12,
  "Mono Research Brief": reportNames.R11,
  "Mono / Porcelain / Palm / Wire": "Classic Amber",
  "MONO / PAPER GREY": "CLASSIC AMBER",
  "Lieflat Charts / Mono": "灯塔 / Classic Amber",
  "三套彩色预设": "经典琥珀主题",
  "深绿=工单最多的渠道": "深琥珀色=工单最多的渠道",
  PORCELAIN: "CLASSIC AMBER",
  PALM: "CLASSIC AMBER",
  WIRE: "CLASSIC AMBER",
  MONO: "CLASSIC AMBER",
};

function renameText(text) {
  for (const [before, after] of Object.entries(layoutNames)) text = text.replaceAll(before, after);
  return text.replaceAll("Lieflat 报告模板", "灯塔报告模板");
}

function adaptVisibleNames(html) {
  // Script identifiers, source paths and historical attribution do not participate in display-name changes.
  const protectedBlocks = [];
  html = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => {
    protectedBlocks.push(block);
    return "\u0000" + (protectedBlocks.length - 1) + "\u0000";
  });
  html = html.replace(/>([^<]*)</g, (match, text) => ">" + renameText(text) + "<");
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => protectedBlocks[Number(index)]);
}

function colorAdapter(tokens) {
  const token = (name) => {
    assert.ok(/^#[0-9a-f]{6}$/i.test(tokens[name] ?? ""), "Missing report color token " + name);
    return tokens[name];
  };
  const roles = new Map();
  const assign = (colors, name) => {
    for (const color of colors) roles.set(color.toLowerCase(), token(name));
  };
  assign(["#f7f2eb", "#f0efeb", "#f0f0ee", "#f0efe9"], "--bg");
  assign(["#081f5c", "#58402e", "#1f1e1c", "#1c1c1a"], "--text");
  assign(["#334eac", "#d4a017", "#f5572f"], "--viz-accent");
  assign(["#43593b", "#22211f"], "--viz-accent-strong");
  assign(["#7096d1", "#77835a", "#8f8e86"], "--viz-series-secondary");
  assign(["#929960"], "--viz-series-secondary-text");
  assign(["#bad6eb", "#acad79", "#c0bfb7"], "--viz-accent-soft");
  assign(["#f2d17e", "#d0e3ff"], "--viz-accent-subtle");
  assign(["#28311f", "#272725"], "--surface-inverse");
  assign(["#8f8e88", "#77766f", "#4a4944"], "--text-muted");
  assign(["#b0afa9", "#a5a49e"], "--text-soft");
  assign(["#c6c5bf", "#d5d4cd"], "--border-strong");
  assign(["#deddd6", "#dcdad2", "#d8d7d1", "#e5e4de", "#e7e6e0"], "--border");

  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  function mapColor(value) {
    const original = value.trim();
    const hex = original.toLowerCase();
    if (roles.has(hex)) return roles.get(hex);
    if (hex === "#0002") return "rgba(" + channels(token("--text")).join(",") + ",0.13)";
    const rgb = original.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (!rgb) return value;
    const color = "#" + rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
    const mapped = roles.get(color);
    if (!mapped) return value;
    if (rgb[4] === undefined) return mapped;
    return "rgba(" + channels(mapped).join(",") + "," + rgb[4] + ")";
  }

  function css(source) {
    // Restrict replacement to declaration values. Selectors, factual copy and identifiers are untouched.
    return source.replace(/([-\w]+)\s*:\s*([^;{}]*)(?=[;}])/g, (declaration, property, value) => {
      const mapped = value.replace(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi, mapColor);
      return property + ":" + mapped;
    });
  }
  function javascript(source) {
    if (source.includes("echarts.init(")) {
      const seriesColors = JSON.stringify(engineSeriesColors(tokens));
      source = source.replaceAll("g.setOption(opt)", "g.setOption({color:" + seriesColors + ",...opt})")
        .replaceAll("g.setOption({\n", "g.setOption({\n    color:" + seriesColors + ",\n");
    }
    // R09 describes this library itself. Its source palette-count annotation must match the single consumer theme.
    source = source.replace("['配色预设','Mono / Porcelain / Palm / Wire','4',.55]", "['统一主题','Classic Amber','1',.55]");
    source = source.replace(
      "backgroundColor:VALUES.map((_,i)=>rk(i)<2?INK:FAINT)",
      "backgroundColor:VALUES.map((_,i)=>rk(i)<2?" + JSON.stringify(token("--viz-accent-strong")) + ":" + JSON.stringify(token("--viz-accent-soft")) + ")",
    );
    source = source.replaceAll("lineStyle:{color:INK", "lineStyle:{color:" + JSON.stringify(token("--viz-accent-strong")));
    source = source.replace(/Chart\.defaults\.plugins\.tooltip\.bodyColor\s*=\s*['"][^'"]+['"]/g,
      "Chart.defaults.plugins.tooltip.bodyColor=" + JSON.stringify(token("--text-inverse")));
    // A complete color literal can be a palette constant, SVG attribute, Canvas option or chart engine option.
    return source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (literal) => {
      const value = literal.slice(1, -1);
      if (Object.hasOwn(layoutNames, value)) return JSON.stringify(layoutNames[value]);
      if (!/^(?:#[0-9a-f]{3,8}|rgba?\([\d.,\s]+\))$/i.test(value)) return literal;
      return literal[0] + mapColor(value) + literal[0];
    });
  }
  return { css, javascript, mapColor, token };
}

/**
 * Adapt the committed Chinese report files to Lantern's single Classic Amber theme.
 * Source records and their upstream digests are retained. Caller supplies raw Chinese-edition files.
 */
export function adaptReports(files, tokens) {
  const palette = colorAdapter(tokens);
  for (const [name, data] of files) {
    if (!name.startsWith("reports/")) continue;
    if (name.endsWith(".html")) {
      let html = data.toString("utf8");
      html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_, attrs, css) => "<style" + attrs + ">" + palette.css(css) + "</style>");
      html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_, attrs, js) => "<script" + attrs + ">" + palette.javascript(js) + "</script>");
      html = html.replace(/\b(fill|stroke|color|bgcolor)=(["'])([^"']+)\2/gi, (_, attr, quote, value) => attr + "=" + quote + palette.mapColor(value) + quote);
      html = adaptVisibleNames(html);
      if (name === "reports/index.html") {
        html = html.replace(/<h1>[^<]*<\/h1>\s*<p class="lede">[\s\S]*?<\/p>/,
          '<h1>灯塔整页报告</h1><p class="lede">灯塔《访问与使用周报》以一张 A4 呈现本周访问、模块与 AI 使用概况。演示与整页版共用虚构样例。</p>' +
          '<p><a href="../lantern/report.html">打开灯塔自有周报 →</a></p><h2>上游版式参考</h2><p class="lede">以下 12 种版式与财务案例来自 Lieflat，已适配灯塔配色。</p>');
      }
      html = html.replaceAll("色板正本", "原模板配色来源");
      if (!html.includes('data-lantern-report-theme')) {
        const labels = {
          "report-01.zh.html": ".kick .n{color:var(--primary-text)}\n@media print{body{display:block;padding:0}.sheet{width:100%;max-width:none}.main{padding:20px 24px 0 8px}.dek,.qhead,.claim,.traits{margin-top:16px}.traits{break-inside:avoid}}",
          "report-03.zh.html": ".topbar b{color:var(--text-inverse)}",
          "report-09.zh.html": ".hero .meta .d b,.foot .warn{color:var(--primary-text)}",
          "report-10.zh.html": "table.log td.hot{color:var(--primary-text)}",
        };
        const theme = [
          ":root{--sans:var(--font-sans);--serif:var(--font-display);--serifzh:var(--font-display);--dark:var(--surface-inverse);--railbg:var(--primary-text)}",
          ".miles .m.amber,.mosaic .c2,.mosaic .c4,.mosaic .c5{color:var(--on-primary)}",
          "svg text.fade[fill=\"" + palette.token("--viz-accent") + "\" i]{fill:var(--primary-text)}",
          "svg text.fade[fill=\"" + palette.token("--viz-series-secondary") + "\" i]{fill:var(--viz-series-secondary-text)}",
          ".local-report-back{border-color:var(--border);background:var(--surface);color:var(--text)}",
          labels[name.slice("reports/".length)],
        ].filter(Boolean).join("\n");
        html = html.replace("</head>", '<link rel="stylesheet" href="../tokens.css" data-lantern-report-theme>\n<style>\n' + theme + '\n</style>\n</head>');
      }
      files.set(name, html);
    } else if (name === "reports/manifest.json") {
      const metadata = JSON.parse(data.toString("utf8"));
      metadata.theme = "Classic Amber V3";
      for (const item of [...metadata.templates, ...metadata.examples]) {
        item.title = renameText(item.title);
        item.theme = "Classic Amber V3";
      }
      files.set(name, JSON.stringify(metadata, null, 2) + "\n");
    } else if (name === "reports/README.md") {
      files.set(name, data.toString("utf8").replace("各模板保留原项目的版心、叙事顺序、图表与色板。", "各模板保留原项目的版心、叙事顺序和图表数据，配色统一使用灯塔 Classic Amber。").replace("预览图保持上游原图，用于选择版式。", "预览图来自灯塔适配页面，用于选择版式。") + "\n灯塔接入版使用 Classic Amber 配色。预览图由实际报告离线渲染生成。修改模板或主题后，可从仓库根目录运行 node scripts/design-visualizations/reports.mjs --render-previews 更新十二张缩略图。需要可用的 Chromium 或 Chrome，以及已安装的 playwright-core 或 playwright。可用 --browser <浏览器路径> 和 --playwright-module <模块路径> 显式指定，也可设置 CHROME_PATH / PLAYWRIGHT_MODULE。\n");
    }
  }
}

/** Rebuild thumbnails from adapted HTML. Only the derived previews are written. */
export async function renderReportPreviews(options = {}) {
  const require = createRequire(import.meta.url);
  let localPackage = options.playwrightModule ?? process.env.PLAYWRIGHT_MODULE;
  if (!localPackage) {
    try {
      localPackage = require.resolve("playwright-core");
    } catch {
      try {
        localPackage = require.resolve("playwright");
      } catch {
        throw new Error("Install Playwright or pass --playwright-module <module path> / PLAYWRIGHT_MODULE.");
      }
    }
  }
  const { chromium } = require(localPackage);
  const browserPath = options.browser ?? process.env.CHROME_PATH
    ?? (process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe") : undefined);
  const root = options.root ?? fileURLToPath(new URL("../../docs/design/visualizations/reports/", import.meta.url));
  const metadata = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
  const previews = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", locale: "zh-CN" });
    await context.route(/^https?:\/\//, (route) => route.abort("blockedbyclient"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => errors.push("Missing report resource: " + request.url()));
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) errors.push("Unexpected network request: " + request.url());
    });
    for (const item of metadata.templates) {
      await page.goto(pathToFileURL(join(root, item.file)).href, { waitUntil: "load" });
      for (const chart of await page.locator("svg[id],canvas").all()) {
        await chart.scrollIntoViewIfNeeded();
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(300);
      await page.addStyleTag({ content: ".local-report-back{display:none!important}" });
      const report = page.locator(".sheet,.report").first();
      mkdirSync(dirname(join(root, item.preview)), { recursive: true });
      await report.screenshot({ path: join(root, item.preview), animations: "disabled" });
      previews.push({
        file: item.preview,
        report: item.file,
        sourceSha256: createHash("sha256").update(readFileSync(join(root, item.file), "utf8").replaceAll("\r\n", "\n")).digest("hex"),
        sha256: createHash("sha256").update(readFileSync(join(root, item.preview))).digest("hex"),
      });
    }
    assert.deepEqual(errors, [], "Report preview runtime errors");
  } finally {
    await browser.close();
  }
  const index = { theme: "Classic Amber V3", tokensSha256: createHash("sha256").update(readFileSync(join(root, "../tokens.css"), "utf8").replaceAll("\r\n", "\n")).digest("hex"), command: "node scripts/design-visualizations/reports.mjs --render-previews", previews };
  const path = join(root, "assets/PREVIEWS.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(index, null, 2) + "\n");
  return previews;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    "render-previews": { type: "boolean" },
    "playwright-module": { type: "string" },
    browser: { type: "string" },
    root: { type: "string" },
  } });
  if (!values["render-previews"]) throw new Error("Use --render-previews to regenerate the adapted report thumbnails.");
  const previews = await renderReportPreviews({ playwrightModule: values["playwright-module"], browser: values.browser, root: values.root });
  assert.equal(previews.length, 12);
  console.log("Generated " + previews.length + " Classic Amber report previews.");
}

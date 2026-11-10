import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

/** Render the actual offline gallery graphics, then fit them into consistent catalog thumbnails. */
export async function renderChartPreviews(options = {}) {
  const require = createRequire(import.meta.url);
  let playwrightModule = options.playwrightModule ?? process.env.PLAYWRIGHT_MODULE;
  if (!playwrightModule) {
    try {
      playwrightModule = require.resolve("playwright-core");
    } catch {
      playwrightModule = require.resolve("playwright");
    }
  }
  const { chromium } = require(playwrightModule);
  const browserPath = options.browser ?? process.env.CHROME_PATH
    ?? (process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe") : undefined);
  const root = options.root ?? fileURLToPath(new URL("../../docs/design/visualizations/", import.meta.url));
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const presets = [...manifest.presets, ...manifest.legacyPresets];
  const selected = options.ids ? options.ids.split(",").map((id) => id.trim()) : presets.map(({ id }) => id);
  assert.ok(selected.length > 0 && selected.every((id) => presets.some((p) => p.id === id)), "Unknown or empty preset IDs");
  const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce", locale: "zh-CN" });
    const failures = [];
    await context.route(/^https?:\/\//, (route) => {
      failures.push("Unexpected network request: " + route.request().url());
      return route.abort("blockedbyclient");
    });
    const imagePage = await context.newPage();
    await imagePage.setContent('<canvas width="520" height="280"></canvas>');
    mkdirSync(join(root, "previews"), { recursive: true });
    for (const preset of presets.filter(({ id }) => selected.includes(id))) {
      const [file, id] = preset.preview.split("#");
      // Isolate each card from timers and force simulations started while viewing earlier cards.
      const page = await context.newPage();
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("requestfailed", (request) => failures.push("Missing gallery resource: " + request.url()));
      await page.goto(pathToFileURL(join(root, file)).href, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const card = page.locator(".card#" + id);
      const graphic = card.locator("svg[id],canvas[id],div.ch[id],div.chartbox[id],div#ch").first();
      await graphic.scrollIntoViewIfNeeded();
      await page.waitForFunction((element) => element.tagName.toLowerCase() === "canvas"
        ? element.width > 0 && element.height > 0
        : element.querySelectorAll("path,line,circle,rect,polygon,ellipse,canvas").length > 0,
      await graphic.elementHandle());
      // Force layouts and dynamic traces need a settled frame after the visibility observer fires.
      const settleTime = { B2: 1600, G11: 1600, G18: 2800 }[id] ?? 400;
      await page.waitForTimeout(settleTime);
      await page.mouse.move(0, 0);
      await graphic.evaluate((element) => {
        const chart = window.echarts?.getInstanceByDom(element);
        if (chart && !chart.getOption().series?.some((series) => series.type === "graph")) {
          // Capture a complete data state, including charts that periodically morph between views.
          const option = chart.getOption();
          option.animation = false;
          for (const series of option.series ?? []) {
            series.animation = false;
            series.universalTransition = false;
          }
          chart.clear();
          chart.setOption(option);
        }
        const canvasChart = window.Chart?.getChart(element);
        if (canvasChart) {
          canvasChart.stop();
          canvasChart.update("none");
        }
      });
      const info = await graphic.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const card = element.closest(".card");
        return { sourceWidth: Math.round(bounds.width), sourceHeight: Math.round(bounds.height),
          background: getComputedStyle(card).backgroundColor,
          shapes: element.querySelectorAll("path,line,circle,rect,polygon,ellipse").length };
      });
      assert.ok(info.sourceWidth > 0 && info.sourceHeight > 0, "Empty graphic bounds: " + id);
      const source = await graphic.screenshot({ type: "png", animations: "disabled" });
      const image = await imagePage.evaluate(async ({ png, background }) => {
        const source = new Image();
        source.src = "data:image/png;base64," + png;
        await source.decode();
        const canvas = document.querySelector("canvas");
        const context = canvas.getContext("2d");
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
        const scan = document.createElement("canvas");
        scan.width = source.width;
        scan.height = source.height;
        const scanContext = scan.getContext("2d", { willReadFrequently: true });
        scanContext.fillStyle = background;
        scanContext.fillRect(0, 0, scan.width, scan.height);
        scanContext.drawImage(source, 0, 0);
        const sourcePixels = scanContext.getImageData(0, 0, scan.width, scan.height).data;
        const base = context.getImageData(0, 0, 1, 1).data;
        let left = scan.width, top = scan.height, right = 0, bottom = 0;
        for (let y = 0; y < scan.height; y++) {
          for (let x = 0; x < scan.width; x++) {
            const offset = (y * scan.width + x) * 4;
            if (Math.max(Math.abs(sourcePixels[offset] - base[0]), Math.abs(sourcePixels[offset + 1] - base[1]),
              Math.abs(sourcePixels[offset + 2] - base[2])) > 6) {
              left = Math.min(left, x); top = Math.min(top, y);
              right = Math.max(right, x); bottom = Math.max(bottom, y);
            }
          }
        }
        // Trim only empty outer margins. Keep every visible label and the graphic's original aspect ratio.
        const sourceWidth = Math.max(1, right - left + 1), sourceHeight = Math.max(1, bottom - top + 1);
        const scale = Math.min((canvas.width - 24) / sourceWidth, (canvas.height - 24) / sourceHeight);
        const width = sourceWidth * scale;
        const height = sourceHeight * scale;
        context.drawImage(source, left, top, sourceWidth, sourceHeight,
          (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let paintedPixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (Math.max(Math.abs(pixels[offset] - base[0]), Math.abs(pixels[offset + 1] - base[1]),
            Math.abs(pixels[offset + 2] - base[2])) > 12) paintedPixels++;
        }
        return { data: canvas.toDataURL("image/webp", 0.88).split(",")[1], paintedPixels };
      }, { png: source.toString("base64"), background: info.background });
      assert.ok(image.paintedPixels > 500, "Blank or incomplete graphic: " + id);
      const output = Buffer.from(image.data, "base64");
      writeFileSync(join(root, "previews", id + ".webp"), output);
      results.push({ id, width: 520, height: 280, bytes: output.length, paintedPixels: image.paintedPixels, ...info });
      await page.close();
    }
    assert.deepEqual(failures, [], "Gallery preview rendering errors");
  } finally {
    await browser.close();
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    "playwright-module": { type: "string" }, browser: { type: "string" },
    root: { type: "string" }, ids: { type: "string" },
  } });
  const previews = await renderChartPreviews({ playwrightModule: values["playwright-module"], browser: values.browser,
    root: values.root, ids: values.ids });
  console.log(JSON.stringify({ count: previews.length, totalBytes: previews.reduce((sum, image) => sum + image.bytes, 0), previews }, null, 2));
}

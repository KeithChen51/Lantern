import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { colorDeclarations, visualizationColors } from "./design-visualizations/colors.mjs";
import { adaptGallery } from "./design-visualizations/gallery.mjs";
import { adaptPresentations } from "./design-visualizations/presentations.mjs";
import { adaptReports } from "./design-visualizations/reports.mjs";
import { renderCatalog } from "./design-visualizations/catalog.mjs";

const [, , sourceDir, revision] = process.argv;
if (!sourceDir || !/^[a-f0-9]{40}$/i.test(revision ?? "")) {
  throw new Error("Usage: node scripts/sync-design-visualizations.mjs <lieflat-charts checkout> <Chinese edition commit SHA>");
}
const checkout = resolve(sourceDir);
const target = fileURLToPath(new URL("../docs/design/visualizations/", import.meta.url));
const local = (name) => readFileSync(join(target, name), "utf8");
const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { maxBuffer: 16 * 1024 * 1024 });
const sourceRoot = revision + ":zh-CN";
const list = git("ls-tree", "-r", "-z", "--name-only", sourceRoot).toString("utf8").split("\0").filter(Boolean);
const load = (name) => git("cat-file", "blob", sourceRoot + "/" + name);
const json = (value) => JSON.stringify(value, null, 2) + "\n";

const files = new Map();
const edition = JSON.parse(load("edition.json"));
const manifest = JSON.parse(load("manifest.json"));
const deck = "presentations/presentation.zh.html";
const deckFiles = new Set([deck, edition.portals.presentations, ...edition.examples.filter((e) => e.kind === "presentation").map((e) => e.preview)]);
for (const name of list) {
  // Keep the shells, guides, report previews and CSS owned by Lantern. Import data and native layouts once.
  if (/^(gallery|maps|runtime|licenses|source|examples)\//.test(name) ||
      (name.startsWith("reports/") && !name.startsWith("reports/assets/")) || deckFiles.has(name)) {
    files.set(name, load(name));
  }
}
const upstream = JSON.parse(files.get("source/UPSTREAM.json"));
assert.equal(upstream.commit, manifest.sourceRevision);
assert.equal(edition.sourceRevision, manifest.sourceRevision);
assert.ok(files.has(deck) && files.has(manifest.sourceCatalog));
for (const group of manifest.galleries) {
  for (const page of group.pages) assert.ok(files.has(page), page);
}

const colors = visualizationColors(local("../lighthouse-classic-amber-visual-spec.html"));
const paletteRegion = /(  \/\* colors:start[^*]*\*\/\n)[\s\S]*?(  \/\* colors:end \*\/)/;
const css = local("tokens.css").replaceAll("\r\n", "\n");
assert.ok(paletteRegion.test(css), "Missing generated token region");
files.set("tokens.css", css.replace(paletteRegion, (_, first, last) => first + colorDeclarations(colors) + "\n" + last));

adaptGallery(files, colors);
adaptPresentations(files, colors);
adaptReports(files, colors);

// Lantern owns the navigation and reuse guidance. The Chinese manifest supplies each chart's data shape and target.
const host = local("index.html").replaceAll("\r\n", "\n");
const region = /(<!-- synced catalog:start -->\n)[\s\S]*?( *<!-- synced catalog:end -->)/;
assert.ok(region.test(host), "Missing development catalog region");
files.set("index.html", host.replace(region, (_, first, last) => first + renderCatalog(manifest) + "\n" + last));
const theme = "Classic Amber V3";
files.set("manifest.json", json({ ...manifest, title: "灯塔数据可视化图库", theme }));
const reportIndex = JSON.parse(files.get("reports/manifest.json"));
files.set("edition.json", json({
  schemaVersion: 2, theme, sourceRevision: manifest.sourceRevision, portals: edition.portals,
  lanternTemplates: [
    { kind: "presentation", title: "灯塔访问与使用周报 · 演示报告", preview: "lantern/presentation.html" },
    { kind: "report", title: "灯塔访问与使用周报 · 整页报告", preview: "lantern/report.html" },
  ],
  presentations: [{ id: "classic-amber", title: "灯塔经典琥珀演示", preview: deck }],
  reports: reportIndex.templates.map(({ id, title, file }) => ({ id, title, preview: "reports/" + file })),
  examples: edition.examples, guides: edition.guides.map(({ title, preview }) => ({ title, preview })),
}));
files.set("source/LOCALIZATION.json", json({
  upstreamRepository: upstream.repository, upstreamCommit: manifest.sourceRevision,
  localizedCommit: revision, localizedDirectory: "zh-CN", themeSource: "../../lighthouse-classic-amber-visual-spec.html#color",
}));
for (const [name, content] of files) {
  const path = join(target, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
console.log("Synced the Lantern edition from Chinese commit " + revision);

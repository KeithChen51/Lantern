import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { colorDeclarations, visualizationColors } from "./design-visualizations/colors.mjs";
import { renderCatalog } from "./design-visualizations/catalog.mjs";
import "../docs/design/visualizations/verify.mjs";

const root = new URL("../docs/design/visualizations/", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
const manifest = JSON.parse(read("manifest.json"));
assert.ok(read("index.html").replaceAll("\r\n", "\n").includes(renderCatalog(manifest)), "Regenerate catalog after changing chart classification");
const provenance = JSON.parse(read("source/LOCALIZATION.json"));
assert.equal(provenance.upstreamCommit, manifest.sourceRevision);
assert.match(provenance.localizedCommit, /^[a-f0-9]{40}$/);
assert.equal(manifest.theme, "Classic Amber V3");
const spec = read("../lighthouse-classic-amber-visual-spec.html");
assert.ok(spec.includes('id="visualizations"') && spec.includes('href="visualizations/index.html"'));
assert.ok(read("index.html").includes('href="../lighthouse-classic-amber-visual-spec.html#visualizations"'));
assert.ok(read("tokens.css").includes("--calendar-mark: square"));
assert.ok(read("index.html").includes('href="../lighthouse-classic-amber-visual-spec.html#color"'));
assert.equal(new URL(provenance.themeSource, new URL("source/LOCALIZATION.json", root)).href,
  new URL("../lighthouse-classic-amber-visual-spec.html#color", root).href);
assert.ok(read("tokens.css").replaceAll("\r\n", "\n").includes(colorDeclarations(visualizationColors(spec))), "Bring chart roles up to date with #color");
assert.ok(!existsSync(new URL("color", root)), "Unexpected original palette gallery");
assert.ok(!readdirSync(new URL("presentations", root)).some((f) => /^complete-.*-zh\.html$/.test(f)), "Unexpected original palette deck");
for (const deck of ["presentation.zh.html", "lenny-2026-survey.zh.html"]) {
  assert.ok(!read("presentations/" + deck).includes('src="mono-tokens.js"'), "Deck token example must resolve to the shared gallery asset");
  assert.ok(read("presentations/" + deck).includes('src="../gallery/mono-tokens.js"'));
}
const previews = JSON.parse(read("reports/assets/PREVIEWS.json"));
const textHash = (s) => createHash("sha256").update(s.replaceAll("\r\n", "\n")).digest("hex");
assert.equal(previews.theme, manifest.theme);
assert.equal(previews.tokensSha256, textHash(read("tokens.css")), "Regenerate report previews after changing the theme");
const reportFiles = JSON.parse(read("reports/manifest.json")).templates.map((t) => t.file);
assert.deepEqual(previews.previews.map((p) => p.report).sort(), reportFiles.sort());
for (const { report, file, sourceSha256, sha256 } of previews.previews) {
  const source = read("reports/" + report);
  const png = readFileSync(new URL("reports/" + file, root));
  assert.equal(textHash(source), sourceSha256, "Regenerate the thumbnail for " + report);
  assert.equal(createHash("sha256").update(png).digest("hex"), sha256, file);
}
console.log("Verified the Lantern catalog entry, exact #color roles, single theme, report thumbnails and Chinese source revision.");

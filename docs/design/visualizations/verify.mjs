import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("./", import.meta.url);
const bytes = (path) => readFileSync(new URL(path, root));
const read = (path) => bytes(path).toString("utf8");
const json = (path) => JSON.parse(read(path));
const digest = (path) => createHash("sha256").update(bytes(path)).digest("hex");

const manifest = json("manifest.json");
const upstream = json("source/UPSTREAM.json");
assert.equal(manifest.sourceRevision, upstream.commit);
assert.equal(digest(manifest.sourceCatalog), upstream.files[upstream.catalog]);
const rows = Array.from(read(manifest.sourceCatalog).matchAll(/^\|\s*([A-Z]\d+)\s*\|/gm), ([, id]) => id);
const active = manifest.presets.map((p) => p.id);
assert.deepEqual(active.toSorted(), rows.toSorted(), "Active presets must match the upstream catalog");
assert.equal(new Set(active).size, active.length);
assert.deepEqual(manifest.legacyPresets.map((p) => p.id).sort(), ["G1", "G2"]);
assert.ok(manifest.legacyPresets.every((p) => !active.includes(p.id) && p.status === "legacy"));
const entries = [...manifest.presets, ...manifest.legacyPresets];
const index = read("index.html");
for (const { id } of entries) {
  const path = "previews/" + id + ".webp";
  assert.ok(index.includes('src="' + path + '"'), "Missing preview on card " + id);
  assert.equal(bytes(path).subarray(8, 12).toString(), "WEBP", path);
}
const links = Array.from(index.matchAll(/href="(gallery\/[^"]+)"/g), ([, ref]) => ref);
assert.deepEqual(links.sort(), entries.map((p) => p.preview).sort(), "Catalog preview links");

function checkAssets(file, html) {
  // Template scripts include documentation examples of HTML tags inside comments.
  const markup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, "$1</script>");
  for (const [, ref] of markup.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/gi)) {
    if (ref === "data:," || ref.startsWith("data:image/")) continue;
    const url = new URL(ref, new URL(file, root));
    assert.ok(url.href.startsWith(root.href) && existsSync(url), "Invalid offline dependency in " + file + ": " + ref);
  }
}
checkAssets("index.html", index);
const pages = new Set();
for (const group of manifest.galleries) {
  const members = manifest.presets.filter((p) => p.system === group.id);
  assert.equal(members.length, group.presetCount, group.id);
  assert.ok(index.includes('id="' + group.id + '"'), group.id);
  for (const file of group.pages) {
    const html = read(file);
    pages.add(file);
    assert.ok(html.includes('href="../index.html#' + group.id + '"'), file + " return link");
    checkAssets(file, html);
    const cardIds = Array.from(html.matchAll(/<div\b[^>]*class="card(?: [^"]*)?"[^>]*\bid="([A-Z]\d+)"/g), ([, id]) => id);
    const wanted = entries.filter((p) => p.preview.split("#")[0] === file);
    assert.deepEqual(cardIds.sort(), wanted.map((p) => p.id).sort(), file + " cards");
  }
}
for (const p of entries) {
  const [file, id] = p.preview.split("#");
  assert.equal(id, p.id);
  assert.ok(pages.has(file), file);
}
for (const dep of manifest.runtimeContract.dependencies) {
  assert.equal(digest(manifest.runtimeContract.root + "/" + dep.file), dep.sha256, dep.package);
}
for (const map of json("maps/DATA.json").entries) {
  assert.equal(digest("maps/" + map.file), map.sha256, map.id);
}
console.log(active.length + " current presets, " + manifest.legacyPresets.length + " legacy presets, " + pages.size + " local gallery pages; offline assets and hashes verified.");

const edition = json("edition.json");
assert.equal(edition.sourceRevision, manifest.sourceRevision);
assert.equal(edition.theme, "Classic Amber V3");
assert.deepEqual(edition.presentations.map(({ id }) => id), ["classic-amber"]);
assert.ok(!edition.colorGalleries?.length);
const known = new Set();
assert.deepEqual(edition.lanternTemplates.map((p) => p.kind), ["presentation", "report"]);
for (const { kind, preview } of edition.lanternTemplates) {
  const source = read(preview);
  assert.ok(index.includes('href="' + preview + '"'), preview);
  assert.ok(read(edition.portals[kind === "report" ? "reports" : "presentations"]).includes('href="../' + preview + '"'), "Missing native template in portal");
  assert.ok(source.includes('src="weekly-data.js"'), "Use the shared weekly fixture in " + preview);
  checkAssets(preview, source);
}
for (const [section, count] of Object.entries({ presentations: 1, reports: 12, examples: 3 })) {
  assert.equal(edition[section].length, count, section);
  for (const { preview } of edition[section]) {
    assert.ok(!known.has(preview), "Duplicate edition page: " + preview);
    known.add(preview);
    const html = read(preview);
    checkAssets(preview, html);
    // Native HTML may include informational links; image and drawing resources must work offline.
    for (const [, ref] of html.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)) {
      if (ref.startsWith("data:")) continue;
      const file = new URL(ref, new URL(preview, root));
      assert.ok(file.href.startsWith(root.href) && existsSync(file), preview + ": " + ref);
    }
  }
}
for (const portal of Object.values(edition.portals)) {
  checkAssets(portal, read(portal));
  assert.ok(index.includes('href="' + portal + '"'), portal);
  for (const [, ref] of read(portal).matchAll(/<(?:a|img)\b[^>]*?\b(?:href|src)=["']([^"']+)["']/gi)) {
    if (!ref.startsWith("data:")) assert.ok(existsSync(new URL(ref.split("#")[0], new URL(portal, root))), portal + ": " + ref);
  }
}
for (const entry of [...edition.guides, ...edition.examples]) {
  assert.ok(index.includes('href="' + entry.preview + '"') && existsSync(new URL(entry.preview, root)), entry.preview);
}
console.log("Verified the Classic Amber deck, 12 reports, 3 examples, their offline portals and authoring guides.");

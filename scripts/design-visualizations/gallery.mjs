import assert from "node:assert/strict";
import { engineSeriesColors } from "./colors.mjs";

// Consume the committed Chinese galleries and apply the host's brand to value encodings.
// The source copy keeps its own palettes; all replacements happen during Lantern sync.
export function adaptGallery(files, tokens) {
  const token = (name) => {
    const value = tokens[name];
    assert.match(value ?? "", /^#[0-9a-f]{6}$/i, "Expected a resolved hex token " + name);
    return value;
  };
  const ink = token("--text");
  const paper = token("--surface");
  const onPrimary = token("--on-primary");
  const accent = token("--viz-accent");
  const strong = token("--viz-accent-strong");
  const inverse = token("--text-inverse");
  const mix = (from, to, fraction) => "#" + [1, 3, 5].map((offset) => {
    const a = Number.parseInt(from.slice(offset, offset + 2), 16);
    const b = Number.parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * fraction).toString(16).padStart(2, "0");
  }).join("");
  const luminance = (hex) => [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05)
    / (Math.min(luminance(a), luminance(b)) + 0.05);
  const fills = [mix(accent, paper, 0.85), mix(accent, paper, 0.65),
    mix(accent, paper, 0.4), accent, strong];
  const heat = fills.map((fill) => {
    const darkText = fill === accent ? onPrimary : ink;
    const text = ratio(darkText, fill) >= ratio(paper, fill) ? darkText : paper;
    assert.ok(ratio(text, fill) >= 4.5, "Heat-cell text contrast below 4.5 for " + fill);
    return { fill, text };
  });
  for (let index = 1; index < fills.length; index += 1) {
    assert.ok(luminance(fills[index - 1]) > luminance(fills[index]), "Value ramp must darken monotonically");
  }
  const heatDeclaration = "const HEAT=" + JSON.stringify(heat) + ";\n";
  const once = (content, before, after) => {
    assert.equal(content.split(before).length, 2, "Gallery source changed: " + before);
    return content.replace(before, after);
  };
  const update = (name, marker, nextMarker, patch) => {
    const file = "gallery/" + name;
    const source = files.get(file).toString("utf8").replace(/\r\n/g, "\n");
    const start = source.indexOf(marker);
    const end = nextMarker ? source.indexOf(nextMarker, start + marker.length) : source.length;
    assert.ok(start >= 0 && end > start, "Missing gallery block " + marker);
    files.set(file, source.slice(0, start) + patch(source.slice(start, end)) + source.slice(end));
  };

  update("glance-gallery.html", "// ════ G20", "// ════ G21", (block) => {
    block = once(block,
      'const shade=t=>t>64?INK:t>46?C["4A4944"]:t>30?C["8F8E88"]:t>15?C["B0AFA9"]:C["D8D7D1"];',
      heatDeclaration + "const shade=t=>HEAT[t>64?4:t>46?3:t>30?2:t>15?1:0];");
    block = once(block, "const t=v(r,c),x=X0+c*PX,y=Y0+r*PY,dark=t>30;",
      "const t=v(r,c),x=X0+c*PX,y=Y0+r*PY;");
    block = once(block, "rx:9,fill:shade(t),", "rx:9,fill:shade(t).fill,'data-no-accent':true,");
    return once(block, "fill:dark?PAPER:INK,", "fill:shade(t).text,");
  });
  update("glance-gallery.html", "// ════ G21", "// ════ G22", (block) => {
    block = once(block,
      'const SHADE=[INK,C["4A4944"],C["8F8E88"],C["B0AFA9"],C["D8D7D1"]];',
      heatDeclaration + "const SHADE=[...HEAT].reverse();");
    block = block.replace(/\bC\b(?!\s*\[)/g, "CELL");
    block = once(block, "      const dark=r<=3;\n", "");
    block = once(block, "rx:8,fill:SHADE[r-1],", "rx:8,fill:SHADE[r-1].fill,'data-no-accent':true,");
    return once(block, 'fill:dark?PAPER:C["55544E"],', "fill:SHADE[r-1].text,");
  });
  update("lupi-gallery.html", "// ════ L16", "// ════ L17", (block) => {
    block = once(block,
      'const shade=t=>t>36?INK:t>24?C["4A4944"]:t>14?C["8F8E88"]:t>6?C["B0AFA9"]:C["D8D7D1"];',
      heatDeclaration + "const shade=t=>HEAT[t>36?4:t>24?3:t>14?2:t>6?1:0];");
    block = once(block, "rx:4,fill:shade(t),", "rx:4,fill:shade(t).fill,'data-no-accent':true,");
    block = once(block, "'font-weight':800,fill:PAPER,'text-anchor':'middle',",
      "'font-weight':800,fill:shade(t).text,'text-anchor':'middle',");
    block = once(block, "rx:2,fill:c,class:", "rx:2,fill:c,'data-no-accent':true,class:");
    return once(block,
      'const LG=[[C["D8D7D1"],\'1–6\'],[C["B0AFA9"],\'7–14\'],[C["8F8E88"],\'15–24\'],[C["4A4944"],\'25–36\'],[INK,\'37+\']];',
      "const LG=HEAT.map((bucket,index)=>[bucket.fill,['1–6','7–14','15–24','25–36','37+'][index]]);");
  });
  update("lupi-gallery.html", "// ════ L17", "// ════ L19", (block) => {
    block = once(block, "const squareMarks=", heatDeclaration + "const squareMarks=");
    block = once(block, "width:10.8,height:10.8,rx:1.4,", "width:10.8,height:10.8,rx:1.4,'data-no-accent':true,");
    block = once(block, "fill:t>max*.66?", "'data-no-accent':true,fill:t>max*.66?");
    return block.replaceAll('t>max*.66?INK:t>max*.33?C["6A6963"]:C["B0AFA9"]',
      "(t>max*.66?HEAT[4]:t>max*.33?HEAT[2]:HEAT[0]).fill");
  });
  update("big-threads.html", "<!doctype html>", null, (block) => {
    block = once(block, 'const PAPER=C["F0EFEB"],NS=',
      "const LABEL_INVERSE=" + JSON.stringify(inverse) + ';\nconst PAPER=C["F0EFEB"],NS=');
    block = block.replaceAll('C["B3B0A4"]', "LABEL_INVERSE")
      .replaceAll('C["6A6963"]', "LABEL_INVERSE");
    block = once(block, "font-size:12px;color:var(--viz-editorial-c-8f8e88);border-top:",
      "font-size:12px;color:var(--text-inverse);border-top:");
    return once(block,
      "#status .pin{font-size:9px;letter-spacing:.1em;color:var(--viz-editorial-c-55554f);font-weight:700}",
      "#status .pin{font-size:9px;letter-spacing:.1em;color:var(--text-inverse);font-weight:700}");
  });
  const bridgeFile = "gallery/lieflat-theme.js";
  const bridge = files.get(bridgeFile).toString("utf8").replace(/\r\n/g, "\n");
  const sourceAliases = [
    "    const normalIndex = rampIndex(value, normalDataRamp);",
    "    if (darkContext && normalIndex >= 0) return inverseDataRamp[normalIndex];",
    "    const inverseIndex = rampIndex(value, inverseDataRamp);",
    "    if (!darkContext && inverseIndex >= 0) return normalDataRamp[inverseIndex];",
  ].join("\n");
  const contextualAliases = [
    "    const normalIndex = rampIndex(value, normalDataRamp);",
    "    const inverseIndex = rampIndex(value, inverseDataRamp);",
    "    // A shared literal may belong to both ramps. Prefer the current card's role.",
    "    if ((darkContext ? inverseIndex : normalIndex) >= 0) return value;",
    "    if (darkContext && normalIndex >= 0) return inverseDataRamp[normalIndex];",
    "    if (!darkContext && inverseIndex >= 0) return normalDataRamp[inverseIndex];",
  ].join("\n");
  assert.equal(bridge.split(sourceAliases).length, 4, "Expected SVG, line and mark adapters");
  files.set(bridgeFile, bridge.replaceAll(sourceAliases, contextualAliases));
  // Maps set their own geographic scale. Set the engine and legend fallbacks too, including interaction states.
  const mapFile = "gallery/maps-gallery.html";
  let maps = files.get(mapFile).toString("utf8").replaceAll("\r\n", "\n");
  maps = once(maps, "color:var(--primary);font:600 13px", "color:var(--primary-text);font:600 13px");
  maps = once(maps, "const MAP_LEGEND={", "const MAP_LEGEND={\n  contentColor:T.accent,outOfRange:{color:GRID},");
  const options = "    const opt={\n";
  assert.equal(maps.split(options).length, 3, "Expected both geographic maps");
  maps = maps.replaceAll(options, options + "      color:" + JSON.stringify(engineSeriesColors(tokens)) + ",\n");
  files.set(mapFile, maps);
  return files;
}

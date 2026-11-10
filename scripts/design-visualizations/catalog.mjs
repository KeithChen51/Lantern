import assert from "node:assert/strict";

// A preset belongs to one browsing section. Source-family anchors remain stable for older links.
const tasks = [
  { id: "trend", name: "趋势", hint: "比较连续时间里的变化。", ids: "F2 F3 G17 G18 L3 F17 L9 L11 L1 G5 G8" },
  { id: "calendar", name: "日历与热力", hint: "按实际日期或两个维度寻找集中出现的时段。", ids: "L17 F10 G14 G20 L16 L4" },
  { id: "ranking", name: "排名与对比", hint: "比较谁更高、相差多少，或名次如何变化。", ids: "F5 G3 F1 G10 F6 F12 L2 L7 G16 G21" },
  { id: "composition", name: "构成与进度", hint: "查看整体中每部分的占比，以及阶段之间的增减。", ids: "G4 F4 L14 F7 F11 F9 L13 G13 F13 F16 L15" },
  { id: "distribution", name: "分布", hint: "比较分组、频次、区间和异常值。", ids: "F14 F15 G19 G15 L19 F8 G12 L10 L8" },
  { id: "relations", name: "关系与流向", hint: "查看实体之间的归属、连线、流量和多维关系。", ids: "G22 B3 G7 L12 G6 G11 L6 B1 B2 L5 L20 G9" },
  { id: "maps", name: "地图", hint: "比较有真实地理边界的区域数值。", ids: "M1 M2" },
  { id: "legacy", name: "历史参考", hint: "为已有设计稿和旧链接保留的两个图型。", ids: "G1 G2" },
];
const favorites = {
  F2: "逐日观察访问量，可据此设计 PV、UV 双线趋势。",
  L17: "把一年内逐日的访问次数排成方格，比较活跃日期。",
  F5: "用同一刻度比较少量模块或部门的访问量。",
  G4: "看不同入口各占总访问量的多少。",
  F14: "按响应时长等连续值分箱，观察分布。",
  G22: "按起点、终点汇总流量，观察模块之间的去向。",
};
const implementationNotes = {
  F2: "灯塔 1.6.0 的 VisitTrend 展示每日 PV 和 UV。",
  L17: "灯塔 1.6.0 的 VisitHeatmap 展示过去 365 天的访问次数。",
};
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderCatalog(manifest) {
  const entries = [...manifest.presets, ...manifest.legacyPresets];
  const byId = new Map(entries.map((p) => [p.id, p]));
  const ordered = tasks.flatMap((task) => task.ids.split(" "));
  assert.deepEqual(ordered.toSorted(), [...byId.keys()].toSorted(), "Assign each current and legacy chart to one development task");
  const usedFamilies = new Set(tasks.map((t) => t.id));
  const card = (id) => {
    const p = byId.get(id);
    const favorite = Object.hasOwn(favorites, id);
    const familyAnchor = usedFamilies.has(p.system) ? "" : '<span class="anchor" id="' + escapeHtml(p.system) + '"></span>';
    usedFamilies.add(p.system);
    const use = favorites[id] ?? p.dataShape;
    return [
      '          <article class="preset" id="' + id + '" data-family="' + escapeHtml(p.system) + '"' + (favorite ? ' data-favorite' : '') + '>',
      '            ' + familyAnchor + '<a class="preset-link" href="' + escapeHtml(p.preview) + '">',
      '              <img class="chart-preview" src="previews/' + id + '.webp" alt="" width="520" height="280" loading="' + (favorite ? "eager" : "lazy") + '">',
      '              <div class="card-text"><span class="card-number">' + id + '</span><h3>' + escapeHtml(p.name) + '</h3><p>' + escapeHtml(use) + '</p></div>',
      '            </a>',
      '            <div class="card-status"><span>' + (p.status === "legacy" ? "历史 HTML 示例" : "HTML 参考示例") + '</span>' + (implementationNotes[id] ? '<a href="#implementation" title="' + escapeHtml(implementationNotes[id]) + '">1.6.0 页面实现</a>' : '') + '</div>',
      '          </article>',
    ].join("\n");
  };
  const names = tasks.map((t) => '<a href="#' + t.id + '" data-view="' + t.id + '">' + t.name + '</a>').join("");
  return [
    '    <nav class="task-nav" aria-label="按图表用途筛选"><a href="#catalog" data-view="catalog">常用</a>' + names + '<a href="#all" data-view="all">全部</a></nav>',
    '    <div class="result-title"><h2 id="selection-title">按用途选图</h2><p id="selection-note" aria-live="polite">查看图形、数据形状与实现状态。点击缩略图可查看完整交互。</p></div>',
    '    <div class="catalog-content" id="all">',
    ...tasks.map((t) => [
      '      <section class="task-group" id="' + t.id + '" aria-labelledby="title-' + t.id + '">',
      '        <div class="group-heading"><h2 id="title-' + t.id + '">' + t.name + '</h2><p>' + t.hint + '</p></div>',
      '        <div class="preset-grid">', ...t.ids.split(" ").map(card), '        </div>', '      </section>',
    ].join("\n")),
    '    </div>',
  ].join("\n");
}

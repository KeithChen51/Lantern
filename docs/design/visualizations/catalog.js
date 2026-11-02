// The full catalog and its task anchors also work when scripting is disabled.
(() => {
  const catalog = document.querySelector("#catalog");
  const grid = document.querySelector(".catalog-content");
  const groups = Array.from(grid.querySelectorAll(".task-group"));
  const cards = Array.from(grid.querySelectorAll(".preset"));
  const tabs = Array.from(catalog.querySelectorAll("[data-view]"));
  const families = { lupi: "Lupi 叙事", basics: "基础", glance: "快速", interactive: "大型交互" };
  const title = document.querySelector("#selection-title");
  const note = document.querySelector("#selection-note");
  let current;
  const picker = document.createElement("div");
  picker.className = "mobile-picker";
  const pickerLabel = document.createElement("label");
  pickerLabel.textContent = "图表用途";
  pickerLabel.htmlFor = "mobile-task";
  const selectView = document.createElement("select");
  selectView.id = pickerLabel.htmlFor;
  selectView.add(new Option("选择用途", ""));
  selectView.options[0].disabled = true;
  for (const tab of tabs) selectView.add(new Option(tab.textContent, tab.dataset.view));
  picker.append(pickerLabel, selectView);
  catalog.querySelector(".task-nav").after(picker);
  catalog.classList.add("has-picker");
  selectView.addEventListener("change", () => { location.hash = selectView.value; });

  function select(fromHashChange) {
    const hash = location.hash.slice(1);
    const target = document.getElementById(hash);
    const deepCard = target?.matches(".preset") ? target : null;
    const task = groups.find((group) => group.id === hash);
    const family = Object.hasOwn(families, hash);
    const direct = Boolean(task || family || deepCard || hash === "catalog" || hash === "all");
    if (current && !direct && hash && hash !== "top") return;
    current = deepCard?.closest(".task-group").id ?? (direct ? hash : "catalog");
    for (const card of cards) {
      card.hidden = current === "catalog" ? !card.hasAttribute("data-favorite")
        : family ? card.dataset.family !== current
        : current !== "all" && card.closest(".task-group").id !== current;
    }
    for (const group of groups) group.hidden = !group.querySelector(".preset:not([hidden])");
    grid.classList.toggle("flat", current !== "all");
    const active = tabs.find((tab) => tab.dataset.view === current);
    selectView.value = active ? current : "";
    for (const tab of tabs) {
      if (tab === active) tab.setAttribute("aria-current", "true");
      else tab.removeAttribute("aria-current");
    }
    const count = cards.filter((card) => !card.hidden).length;
    title.textContent = current === "catalog" ? "开发常用" : family ? "原库分类 · " + families[current] : active.textContent + "图型";
    note.textContent = current === "catalog" ? "从这 " + count + " 个常用示例开始。点击卡片查看完整图形与交互。"
      : "共 " + count + " 个图型 · 点击卡片查看完整图形与交互。";
    if (deepCard) deepCard.scrollIntoView({ block: "start" });
    else if (direct && (fromHashChange || hash)) catalog.scrollIntoView({ block: "start" });
  }

  select(false);
  window.addEventListener("hashchange", () => select(true));
})();

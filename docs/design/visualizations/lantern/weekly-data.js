// Fictional signed-in activity for the offline Lantern report templates.
window.LanternWeeklyExample = {
  period: { start: "2026-10-19", end: "2026-10-25" },
  daily: [
    { date: "2026-10-19", pv: 76, uv: 29 },
    { date: "2026-10-20", pv: 88, uv: 35 },
    { date: "2026-10-21", pv: 94, uv: 38 },
    { date: "2026-10-22", pv: 108, uv: 43 },
    { date: "2026-10-23", pv: 96, uv: 39 },
    { date: "2026-10-24", pv: 32, uv: 16 },
    { date: "2026-10-25", pv: 26, uv: 12 },
  ],
  // Distinct across the full week, counted independently of the daily UV totals.
  weeklyUsers: 86,
  modules: [
    { name: "路引", pv: 176 },
    { name: "镜鉴", pv: 132 },
    { name: "笃行", pv: 106 },
    { name: "本心", pv: 72 },
    { name: "共创", pv: 34 },
  ],
  ai: { conversations: 38, rounds: 106 },
};

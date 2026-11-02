# 中文整页报告

[打开报告模板库](index.html) · [返回中文总目录](../index.html#reports)

本目录含 R01–R12 共 12 个中文报告模板，及原项目唯一独立的中文财务经营示例。所有数字、结论与数据来源沿用上游示例，接入真实材料时应逐项替换。

各模板保留原项目的版心、叙事顺序和图表数据，配色统一使用灯塔 Classic Amber。在线字体改用本机字体回退，R11 和 R12 的 Chart.js、ECharts 依赖来自 ../runtime/，支持直接离线打开。定尺报告在小屏设备可横向或纵向查看，R11 使用整卡等比缩放。

模板编号、来源路径和原文件摘要记录在 [manifest.json](manifest.json)。预览图来自灯塔适配页面，用于选择版式。报告页右下角可返回模板目录，打印时会隐藏导航按钮。

灯塔接入版使用 Classic Amber 配色。预览图由实际报告离线渲染生成。修改模板或主题后，可从仓库根目录运行 node scripts/design-visualizations/reports.mjs --render-previews 更新十二张缩略图。需要可用的 Chromium 或 Chrome，以及已安装的 playwright-core 或 playwright。可用 --browser <浏览器路径> 和 --playwright-module <模块路径> 显式指定，也可设置 CHROME_PATH / PLAYWRIGHT_MODULE。

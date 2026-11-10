# 灯塔 UI 开发可视化目录

[打开图表目录](index.html) · [返回 Classic Amber 视觉规范](../lighthouse-classic-amber-visual-spec.html#visualizations)

本目录供开发者与编程 AI 为灯塔 UI 选图、查找实现和接入数据。目录按用途展示图表缩略图、适用场景与复用状态。61 个当前图型、2 个历史模板均可离线预览，共用[灯塔 Classic Amber 颜色系统](../lighthouse-classic-amber-visual-spec.html#color)。

## 开发时怎么查

1. 先读[设计系统索引](../README.md)和[图表制作指南](guides/chart-workflow.md)，确认页面、颜色与数据表达规则。
2. 在[开发选型目录](index.html#catalog)按趋势、排名、日历等用途查看缩略图，选定图型编号。
3. 查当前分支 `src/` 中是否已有相应组件。确认它属于共享组件还是页面内实现，核对导出、接口、数据来源与状态。
4. 打开所选编号的一个预览，沿 SVG、Canvas 或图表容器 ID 读取需要的绘制和交互代码。

| 常见 UI 任务 | 选型入口 | 可以先看的图型 |
| --- | --- | --- |
| PV、UV 与其他逐日趋势 | [趋势](index.html#trend) | F2 折线、F3 面积、L3 日序列 |
| 员工、部门与模块 Top N | [排名](index.html#ranking) | F5 刻度条、G3 柱状图 |
| 年度每日访问量 | [日历](index.html#calendar) | L17 日历热力图 |
| 构成、分布、关联与地域 | [完整选型目录](index.html#catalog) | 按数据粒度和比较问题选择候选 |

## 复用状态与实现位置

| 状态 | 开发时确认什么 |
| --- | --- |
| 已有共享组件 | 当前分支存在可导入的 React 实现，按现有接口和状态契约复用 |
| 页面内实现 | 实现在业务页面目录，先核对权限、接口和状态耦合，再决定复用范围 |
| 参考示例 | 独立 HTML 展示图形与交互，接入 React 页面时需要适配组件生命周期和业务数据 |

灯塔 1.6.0 的「访问与使用」已接入[访问日历](../../../src/app/admin/analytics/VisitHeatmap.tsx)、[PV/UV 趋势](../../../src/app/admin/analytics/VisitTrend.tsx)和[员工榜单](../../../src/app/admin/analytics/EmployeeRankings.tsx)。这些组件依赖后台报告数据与相应权限。图库中的 HTML 使用示例数据，可独立离线预览。

## 原库分类与追溯

以下分类与编号保留原库来源及旧链接，选型时可先用上面的任务入口。

| 分类 | 模板 | 适用任务 |
| --- | --- | --- |
| [Lupi 叙事图表](index.html#lupi) | L1–L17、L19、L20，共 19 个 | 复盘、多维对比、需要停留探索的专题 |
| [基础图表](index.html#basics) | F1–F17，共 17 个 | 比较、分布、趋势、关联 |
| [快速图表](index.html#glance) | G3–G22，共 20 个 | 高频监控、周报、仪表盘 |
| [地图](index.html#maps) | M1、M2，共 2 个 | 州级或国家级数值的地理分布 |
| [大型交互图](index.html#interactive) | B1–B3，共 3 个 | 网络关系、服务连接、数据流向 |
| [历史模板](index.html#legacy) | G1、G2，共 2 个 | 复核原有示例与稳定链接 |

## 统一的视觉语言

[图表颜色角色](index.html#colors)说明暖纸、墨色、琥珀和黄铜在浅色、深色表面上的用法。[共享 tokens](tokens.css)提供颜色与字体入口，数据明度梯按角色派生。多序列同时通过名称、位置、点形或实虚线区分，精确读数可从文字或数据表获得。[图表制作指南](guides/chart-workflow.md)

- [灯塔演示](lantern/presentation.html)与[灯塔周报](lantern/report.html)使用同源虚构聚合样例，作为灯塔汇报输出的入口，配有[演示制作细则](guides/presentation.md)与[报告版式说明](guides/report-catalog.md)。
- 第三方[19 页中文演示参考](presentations/presentation.zh.html)和[12 套报告参考](reports/index.html)提供额外版式，按对应[演示目录](guides/presentation-catalog.md)和[报告目录](guides/report-catalog.md)查阅。
- 三个完整示例为[调研数据报告](examples/lenny-2026-survey.html)、[调研演示](presentations/lenny-2026-survey.zh.html)与[财务月报](reports/r04-financial-report.zh.html)。

## 接入 UI

接入时保留平台的布局与基础组件，图表只负责与其任务有关的绘图和交互。React 中在挂载后创建图表实例，在更新时同步数据，在卸载时清理实例、观察器和计时器。手机可在卡片内横向查看大图。

例如，访问与使用看板可以参考 [L17 日历热力图](gallery/lupi-gallery.html#L17)的方格与 [F2 折线图](gallery/basics-gallery.html#F2)的趋势读数。接入业务时从授权统计接口取数，标注时间粒度及 PV、UV 口径，区分零值、缺失、失败与部分覆盖。图库中的演示数据用于复核结构和行为，业务页面按自身权限及数据来源接入。

## 文件与维护

- [图型清单](manifest.json)记录编号、数据形状、来源标题和预览入口，[完整交付清单](edition.json)记录演示、报告及示例。
- [主题桥接脚本](gallery/lieflat-theme.js)将 SVG、Chart.js 和 ECharts 映射到共享颜色角色。字体采用系统回退，运行库与地图资源随目录保存。
- [来源记录](source/LOCALIZATION.json)固定中文适配提交和对应的上游提交，[上游目录](source/catalog.md)核对现行编号，[初版适配清单](source/visualization-manifest.json)用于追溯。
- 原项目注释、示例文案和来源目录用于理解模板与追溯版本；编程 AI 先读本目录维护的规则，再读取选中的单个示例。颜色引用灯塔角色，数据口径以业务接口为准。
- 灯塔维护本页、制作指南、规范入口、目录与 Classic Amber 主题。更新图形和中文实现时，先复核来源项目的指定提交，再运行 `node scripts/sync-design-visualizations.mjs <来源项目路径> <中文提交的完整SHA>`。
- 图型或样式变动后，用 `node scripts/design-visualizations/render-chart-previews.mjs` 从本地页面重新生成缩略图。只更新部分卡片可传 `--ids F2,L17`。脚本使用本机 Chromium 与 Playwright，支持 `--browser` 和 `--playwright-module` 指定路径。
- 灯塔演示与整页周报共用[周报示例数据](lantern/weekly-data.js)。调整日期或指标时，在两份样稿中复核周 UV、图形与文字读数，并检查打印分页。
- 从仓库根目录运行 `node scripts/check-design-visualizations.mjs`，检查数量、入口、锚点、离线资源和运行库 SHA-256。更新后在浏览器复核图形、键盘、手机图内浏览与需要的打印输出。

## 来源与许可

图形、交互和模板结构派生自 Lieflat Charts。原模板附 [PolyForm Noncommercial 1.0.0](licenses/Lieflat-LICENSE.txt) 与[上游第三方说明](licenses/THIRD_PARTY_NOTICES.md)，[来源记录](source/LOCALIZATION.json)保留对应提交。灯塔维护统一的视觉适配与本文档。用户已确认取得完整模板在本公开仓库再分发的授权，记录见 [#111](https://github.com/KeithChen51/Lantern/issues/111#issuecomment-6568510293)；该确认不变更随附的原始许可证。当前离线版本的资源、修改与许可说明见[灯塔分发说明](licenses/LANTERN_DISTRIBUTION.md)。

离线包保留 [Chart.js 4.5.1 的 MIT 许可](licenses/chart.LICENSE.md)、[Apache ECharts 6.1.0 的许可证](licenses/echarts.LICENSE)及 [NOTICE](licenses/echarts.NOTICE)。复制与分发时一并保留对应许可、版权和来源说明。

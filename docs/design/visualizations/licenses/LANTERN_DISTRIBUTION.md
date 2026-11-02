# 灯塔离线图库分发说明

本目录的图形、交互与模板结构派生自 [Lieflat Charts](https://github.com/larashero3-dotcom/lieflat-charts)。来源固定为上游 `ed436ba56b3cbeee20b9b9966b38a9a9689e239c`，中文适配固定为 `0d46b8b5883d2e101398441b1473b459f6d71cf1`；文件追溯见 [UPSTREAM.json](../source/UPSTREAM.json) 与 [LOCALIZATION.json](../source/LOCALIZATION.json)。

灯塔修改了中文目录、Classic Amber 主题、导航、离线依赖与演示布局，并补充虚构周报样例、开发指南和缩略图。用户已确认获得完整模板在本公开仓库再分发的授权，确认记录见 [Issue #111](https://github.com/KeithChen51/Lantern/issues/111#issuecomment-6568510293)。此记录只说明本次入库授权，不授予下游额外使用权；原始 [PolyForm Noncommercial 1.0.0](Lieflat-LICENSE.txt) 与[上游第三方通知](THIRD_PARTY_NOTICES.md)完整保留。

| 本地资源 | 版本与来源 | 许可与通知 |
| --- | --- | --- |
| `runtime/chart.umd.min.js` | Chart.js 4.5.1 | [MIT](chart.LICENSE.md) |
| `runtime/echarts.min.js` | Apache ECharts 6.1.0 | [Apache 2.0](echarts.LICENSE)、[NOTICE](echarts.NOTICE) |
| `maps/usa.js` | Apache ECharts 官方示例固定提交的 USA GeoJSON，转为本地脚本封装 | [Apache 2.0](../maps/echarts-examples-LICENSE.txt) |
| `maps/world.js` | Apache ECharts 4.9.0 的世界地图，转为本地脚本封装 | [Apache 2.0](../maps/echarts4-LICENSE.txt)、[NOTICE](../maps/echarts4-NOTICE.txt) |

地图来源地址、原始数据及本地脚本 SHA-256 见 [DATA.json](../maps/DATA.json)。运行库 SHA-256 见 [manifest.json](../manifest.json) 的 `runtimeContract`。地图数据沿用原始坐标与标识，仅作模板预览。

上游通知描述的是上游的 CDN 与 Google Fonts 方案。本离线版本改用本地运行库、地图脚本与系统字体回退，没有分发 Inter 字体文件，也不请求 CDN 或 Google Fonts。示例数字和图形不代表灯塔业务数据；原项目注释保留来源意义。

# 灯塔产品设计系统

本目录是 Lighthouse 产品界面的唯一设计系统索引。它描述产品 UI 的颜色、字体、布局、组件、页面模式与交互状态；服务品牌 VI、知识正文和活动物料继续分别由 `docs/brand/`、`docs/content/` 与相关历史设计记录负责。

## 当前基线

当前实现基线是 **Classic Amber V3**，对应 Figma 的完整设计系统与原型：

- [Figma · V3 完整设计系统与原型](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=121-983)
- [路引权威定义](hermit-authoritative-definition.md)
- [平台边界与事实源](lighthouse-platform-visual-system.md)

V3 保留本心首页的品牌封面和灯塔原有导航框架。除首页首屏外，平台页面共享同一套页头、内容栅格、卡片、表单、阅读和状态规则。页面主标题统一为桌面端 `44/56`、移动端 `32/44`；背景使用 `#F3EFE0`，主要表面使用 `#FFFDF8`，边框使用 `#DED9CD`，正文使用 `#2C2C2C`，主要行动使用 `#A65D12`。

路引仍是汽车售后服务文化领域助手：回答留在对话中，相关知识以文档推荐卡出现，点击后在路引页内阅读并继续提问。当前产品定义不引入“产物”或“成果”工作台；上传组件支持 PDF、Word、TXT 和 Markdown 的设计状态，实际解析与权限行为以运行代码和接入文档为准。

## 阅读顺序

1. [lighthouse-platform-visual-system.md](lighthouse-platform-visual-system.md)：产品 UI 与服务品牌 VI 的边界、事实源和治理。
2. [lighthouse-classic-amber-visual-spec.html](lighthouse-classic-amber-visual-spec.html)：可在浏览器打开的视觉规范与交互状态示例。
3. [tokens.md](tokens.md)：V3 颜色、字体、网格、间距、圆角、阴影、动效和无障碍 token。
4. [components.md](components.md)：共享组件的结构、语义、状态与可访问性约束。
5. [patterns.md](patterns.md)：跨页面模板、内容密度和响应式降级规则。
6. [do-dont.md](do-dont.md)：新增或迁移界面时的边界检查。
7. [classic-amber-page-migration-audit.md](classic-amber-page-migration-audit.md)：当前页面迁移记录与剩余风险。

## 活跃设计系统文件

| 文件 | 用途 |
| --- | --- |
| `lighthouse-platform-visual-system.md` | 产品 UI、品牌 VI、内容与活动物料的边界；设计系统事实源顺序。 |
| `lighthouse-classic-amber-visual-spec.html` | Classic Amber 的浏览器视觉规范、页面骨架与状态预览。 |
| `tokens.md` | 颜色、字体、网格、间距、圆角、边框、动效、层级和无障碍契约。 |
| `components.md` | `Lh*` 组件、导航、卡片、表单、对话、阅读器和状态组件契约。 |
| `patterns.md` | 本心、镜鉴、笃行、路引、搜索、反馈、后台与移动端页面模板。 |
| `do-dont.md` | 视觉治理、组件复用、状态表达和清理旧原型的规则。 |
| `hermit-authoritative-definition.md` | 路引的产品边界、知识文档阅读、文件上传和原型与实现的区别。 |
| `games-preview-covers.md` | 启航预览封面素材与页面使用说明。 |
| `print-assets/` | 海报等输出物料；不定义产品 UI token。 |

## 历史设计记录

以下文件保留用于追溯品牌内容或活动输出，不是产品 UI 的事实源：

- `2026-07-17-dealer-service-h5-final-share-design.md`
- `dealer-service-h5-v03-visual-redesign-design.md`
- `core-values-english-word-choice-design.md`
- `core-values-english-word-choice-implementation-plan.md`
- `lighthouse-home-brand-demo.html`（首页品牌视觉历史参考）
- `dealer-service-h5-preheat-demo.html`（活动 H5 输出原型）

历史记录可以说明当时的目标、文案或素材，但不能重新引入已废弃的配色、字体、导航或卡片样式。旧的 HTML 探索稿已经移除；需要审阅当前界面时，以 V3 Figma、HTML 视觉规范和运行页面为准。

## 运行对应关系

- `src/app/globals.css`：运行时颜色、字体、Classic Amber shell 和页面级 token。
- `src/components/ui/lighthouse-primitives.tsx`：共享组件与语义状态。
- `src/components/ui/lighthouse-icons.ts`：本地 Solar 图标映射。
- `src/components/ui/lighthouse-design-system.test.ts`：设计系统静态契约测试。
- `src/components/layout/AppShell.tsx`、`Navigation.tsx`：保留灯塔导航框架和首页 shell 变体。

新增界面先查本索引，再查 token、组件和页面模式；如果现有规则无法表达需求，应先补充设计系统契约，再修改运行代码。HTML 视觉规范用于核对和展示，不单独产生运行时能力。

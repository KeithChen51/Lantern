# 知识资料上传前标准化

关联 [Issue #23](https://github.com/KeithChen51/Lantern/issues/23)。本交付包含标准化 Skill、公共元信息、五类正文模板、只读检查器和离线导出器，不改数据库、检索或发布流程。

## 维护入口

- [Skill](../skills/lantern-knowledge-standardize/SKILL.md)
- [字段与正文协议 v1](../skills/lantern-knowledge-standardize/references/protocol.md)
- [机器字段规则及类型章节](../skills/lantern-knowledge-standardize/scripts/schema.mjs)

仓库目录是唯一维护源，可将整个技能目录分发给维护者。Codex 本机建议在 `~/.agents/skills/lantern-knowledge-standardize` 创建指向此目录的链接；若工作区移动/归档，应先把入口改指向保留该技能的稳定检出目录。不要编辑额外复制出来的版本。

## 使用

进入 Skill 目录，执行 `npm ci --ignore-scripts` 安装锁定依赖。用户可要求 AI：

> 使用 lantern-knowledge-standardize 整理这份资料，保留事实边界，输出 Markdown 和单独检查报告，暂不上传。

```sh
node scripts/check.mjs /absolute/path/article.md
node scripts/check.mjs /absolute/path/article.md --id confirmed-resource-id --export /absolute/path/new-import.json
npm test
```

校验不修改输入、不检查网络、不访问数据库。出口是机器格式检查通过/未通过，不代表资料真实、链接可达或已发布。导出不覆盖已有文件。`id` 由维护者提供：新建时确认新编号，更新时沿用旧编号；这与服务端自动生成的版本 id 不同。

## 与现有中台的关系

五类资源保持 `notice/case/document/skill/tool`。公共元信息映射现有 import 字段，正文类型信息用固定二级章节承载。没有新增数据库字段、虚拟权限、目录或 subtype。原始 Markdown 可供复审；导出的 JSON 内部已移除 frontmatter，避免前端把元信息当文章显示。

在用户明确要求后，可从灯塔项目运行 `npm run hub -- import --input /absolute/path/new-import.json`；此命令只导入草稿，发布另行操作。MCP 的 `lantern_import` 使用同一 JSON。重复编号的覆盖/重命名/跳过需要后续维护端确认，离线 Skill 无法查重。

现有服务可处理附件，但此 Skill 按首期约定只准备 Markdown，不移除其他任务已实现的附件能力。Skill/工具类仅为说明文档，不执行程序。真实资料转换仍由 AI/用户完成，脚本不做无依据改写。

## 验证与升级

技能包 `npm test` 覆盖正反例及 CLI 行为。在仓库安装依赖后运行 `npm run test:knowledge-standardize`，自动安装技能包锁定依赖并运行包测试与服务兼容性测试，验证五类导出与真实服务 schema、草稿导入、幂等行为一致（使用内存 store，不写实库）。

每次字段变更同步协议、schema、模板和兼容性测试；协议不兼容时增加 schemaVersion。阅读器若改变标题锚点或 Markdown 扩展，更新兼容性检查。未闭合括号等被 CommonMark 视作普通文本的内容仍需人工/AI检查；不宣称自动扫描覆盖所有渲染问题。

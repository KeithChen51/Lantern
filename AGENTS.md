# AGENTS.md

## 项目协作原则

本项目不再通过 Linear 管理需求。使用项目实际采用的 GitHub Issues 或内网
CODING 事项记录需求，使用 Pull Request / Merge Request（以下统称 PR）提交变更。

默认流程：需求 Issue → 从 dev 创建工作分支 → 开发与验证 → PR 到 dev →
版本评估 → dev 到 main 的发布 PR → 合并与发布验证。

main 是稳定发布分支，dev 是日常集成分支。非发版阶段不默认修改 main，
日常变更也不直接提交到 dev，而是通过工作分支的 PR 汇入 dev。
本文规定协作行为，不代表远端分支保护、CI 或部署审批已经配置。

## 项目导航

按任务阅读相关入口，无需每次遍历全部文档。以下路径相对于仓库根目录；
文档中的历史实现状态需与当前代码和验证结果核对。

| 工作内容 | 入口 |
| --- | --- |
| 项目概况、本地启动 | [README.md](README.md)、[package.json](package.json)；Node.js >= 20.9.0，安装依赖后运行 npm run dev |
| 环境配置与数据结构 | [.env.example](.env.example)、[prisma/schema.prisma](prisma/schema.prisma)、[prisma/migrations](prisma/migrations) |
| 页面与 API | [src/app](src/app)；共享组件在 [src/components](src/components) |
| 业务模块与基础设施 | [src/modules](src/modules)、[src/infrastructure](src/infrastructure)；配置入口为 [src/config](src/config) |
| 平台设计规范 | [docs/design/README.md](docs/design/README.md)；按其索引查阅 tokens、components、patterns 与视觉规范 |
| 品牌文案与知识文本 | [docs/brand/README.md](docs/brand/README.md)、[品牌价值观白皮书](docs/brand/精诚服务品牌价值观纲领白皮书.md) |
| Action 内容源与页面接入 | [内容目录](docs/content/README.md)、[最终案例批次](docs/content/action-canwu-cases/2026-06-final/README.md)、[src/app/action](src/app/action) |
| Hermit 知识库与构建 | [src/lib/hermit](src/lib/hermit)、[知识源目录](src/lib/hermit/knowledge)、[scripts/build-knowledge.ts](scripts/build-knowledge.ts)；构建命令 npm run build:knowledge |
| Workshop 产品定义 | [共创机制方案](docs/lighthouse-workshop-co-creation-report.md)、[src/modules/workshop](src/modules/workshop) |
| 部署与运行前提 | [运行环境假设](docs/deployment/lighthouse-phase1-runtime-assumptions.md)、[scripts/prepare-standalone.ts](scripts/prepare-standalone.ts)；生产构建 npm run build，启动 npm run start |

## 需求记录与开发授权

1. 对新功能、优化、Bug、内容、部署和技术债，先理解目标、影响模块与范围。
   模块包括 Heart、Mirror、Action、Workshop、Hermit、Admin、Deployment、
   Data、Design、Content、AI / Knowledge、Tech Debt。
2. 新功能必须先有 Issue 再开发；主要优化、Bug、部署与技术债也应关联 Issue。
   小型文档、措辞或格式修正可直接通过 PR 记录目的、范围和验证，避免重复建单。
   只读调查和需求评估不必先建单。
3. 根据用户指定的平台和仓库实际 remote 确认 Issue 所属项目，建单前查重。
   同一需求保持一个主记录；跨平台只做链接引用，不重复维护两套状态。
   不再新建或更新 Linear 事项；历史链接仅作参考。
4. Issue 至少写清背景、问题、目标、范围、不做、验收标准、风险和依赖。
   复杂度低的事项可简写；涉及数据、知识源、内容来源、可访问性或部署时，
   明确对应约束。不要把所有事项自动套进旧版 v1 范围或固定里程碑。
5. 用户只提出想法或要求评估时，先完成需求定义；用户明确要求实现、修复，
   或已经授权开发时，完成必要记录后继续，不重复询问是否开始。
   仅读取一个已有 Issue 或提供其链接，不等于要求立即实现。
6. 平台不可用时，可以完成调查和 Issue 草稿，并说明阻塞；不得声称已建单。
   新功能在正式记录前不进入实现，除非用户明确授权例外。

推荐状态语义：待定义、待开发、开发中、待评审、已集成 dev、已发布。
使用平台已有状态或标签映射，不要求为此创建新工作流。
合入 dev 与正式发布必须区分；Issue 可按团队约定在集成后关闭，
但应记录 PR，并通过发布记录追踪何时进入 main 和实际部署。

优先级参考：紧急为发布阻塞、数据丢失或核心流程不可用；高为当前版本必需
或阻塞主线；中为重要但不阻塞；低为润色和非关键清理。
标签和里程碑按实际需求选用，不强制照搬旧平台配置。

## 分支与工作区

- 修改前检查当前分支、工作区改动、remote、目标分支和已有 PR。
  保留用户及其他任务的改动，不擅自清理、重置、提交或夹带无关文件。
- 正常开发以最新确认的远端 dev 为基点，创建有明确用途的工作分支，
  例如 feature/<issue>-<slug>、fix/<issue>-<slug>、docs/<slug>。
  有并行工作或脏工作区时，优先使用独立 worktree。
- 开发 PR 的目标分支必须是 dev；提交前再次核对 base 分支和完整 diff。
  不因平台默认目标为 main 就直接使用默认值。
- 不默认直接提交或推送 main，也不默认直接推送 dev。
  PR 创建、PR 合并、发布部署是不同动作；仅在任务授权覆盖时执行对应动作。
- 线上紧急修复若确需绕开常规流程，应先获得明确的例外授权，记录原因和
  验证，并把修复同步回 dev，避免下一次发布覆盖修复。

## PR 与验证

开发 PR 应保持范围集中，包含：

- 关联 Issue（如适用）、解决的问题和最终行为。
- 主要改动；UI 变更按需提供截图或演示。
- 实际执行的验证、结果，以及未执行项及原因。
- 数据迁移、配置、内容生成、部署影响和回滚方式（如适用）。

开发前读取关联 Issue 与相关项目文档。实现、验收和 PR 范围保持一致；
发现额外需求时另行记录，不自行扩大任务。完成后回填 Issue / PR 的验证证据。

验证按改动范围选择：

- 纯文档：核对内容、链接、差异和 git diff --check，无需机械运行全套构建。
- 代码或内容流水线：执行相关测试，以及受影响的生成或一致性检查。
- 广泛改动或发布候选：运行 npm test、npm run lint、npx tsc --noEmit、
  npm run build。优先使用项目 build 脚本，以覆盖知识构建和 standalone 准备。
- 行为变化应验证真实场景和必要回归；不要只为低影响修改增加重复实现的测试。
- 验证失败不得标记通过；区分本次引入的问题、既有失败和环境阻塞。

## dev 到 main 的版本评估

只有在完成版本评估、认为可以发布后，才创建 dev → main 的发布 PR。
不因某个功能完成、测试通过或开发 PR 合入 dev 就自动更新 main。

评估至少覆盖：

1. 本次 dev 相对 main 的完整变更清单、关联 Issue 和发布范围。
2. 功能验收、必要回归和发布构建结果；未完成工作、已知风险是否阻塞发布。
3. 数据迁移、环境变量、知识库和内容产物、部署顺序及回滚条件。
4. 发布说明和版本 / 标签计划（按项目实际约定，不自动改版本号）。

把评估结论和证据写入发布 PR。评估通过不等于已获合并或部署授权。
发布 PR 目标必须是 main、来源必须是 dev；不得夹带未评估的额外提交。
评估后若 dev 发生变化，重新核对新增差异并补充相应验证。
合并后记录实际发布状态并验证运行结果；合并 main 不等于部署成功。

## Issue 模板

功能 / 优化 / 技术债：

```markdown
## 背景与当前问题
## 目标结果
## 范围与不做
## 涉及模块 / 页面 / 文件 / 数据或知识源
## 验收标准
## 风险与依赖
## 验证记录
## 关联 PR 与发布记录
```

Bug：

```markdown
## 现象与影响
## 复现方式
## 期望行为
## 修复范围
## 验证记录
## 关联 PR 与发布记录
```

## 模块约束

### Action / 笃行

- 内容修改必须同步源 Markdown、manifest、生成数据、路由映射、测试及归档元数据。
- 用户要求删除或移除内容时，不能只在 UI 隐藏。

### Hermit / 路引

- 定位为汽车售后服务文化领域助手。
- 焦点、输入框和建议列表调整应保留键盘导航及可见的 focus-visible 或等效状态。
- UI 美化不得顺带削弱 RAG、提示词、知识源或聊天行为，除非需求明确要求。

### Workshop / 共创

- v1 聚焦岗位化 Do & Don't 指引；扩展为广泛论坛须单独定义需求。
- 保留品牌方最高管理员的简洁审核模式，除非用户明确重新讨论角色设计。

## 用户沟通

默认中文，按任务复杂度说明需求理解、范围、实际 Issue / PR 链接、
当前分支与目标分支、验证结果和剩余阻塞。
区分“本地完成”“PR 已创建”“已合入 dev”“已合入 main”“已部署”。
只有尚缺影响实现的信息或开发授权时才提问；不要每次机械重复六项清单，
也不要在已有授权后反复确认。

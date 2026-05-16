# Lantern (Lighthouse)

Lighthouse（灯塔）是面向汽车品牌售后体系的企业文化数字平台。平台服务于品牌方售后部门员工、管理者，以及汽车经销商下的一线服务人员，核心目标是帮助用户学习新服务理念、查阅标杆与实践案例、共创一线行为规范，并通过领域智能助手辅助理解和决策。

当前产品主场景是“学习和了解”，同时为后续实践沉淀、行为规范共创和智能问答提供框架。

## 产品结构

Lighthouse 原规划围绕四个板块展开：

- `Heart / 本心`：新服务理念官网与学习入口，承载“我们相信什么”。
- `Mirror / 镜鉴`：外部标杆案例与行业观察，承载“别人有哪些值得参考的实践”。
- `Action / 笃行`：内部服务实践案例库，承载“我们已经做出了什么”。
- `Hermit / 路引`：领域智能助手，基于理念、案例、规范与实践内容辅助理解、查询和判断。

新需求下，平台从四个板块升级为五个板块，新增：

- `Workshop / 共创`：面向一线岗位的 Do & Don't 执行指南共创机制，承载“我们如何一起把理念转化为岗位动作”。

> 代码层当前已加入 `Workshop / 共创` 前端 demo，用于展示共创首页、公共可见区、指南详情、提交区、AI 初审模拟和个人区域。后台管理、真实审核和持久化是下一阶段实现重点。

## 当前产品定位

- 目标用户：汽车品牌方售后部门员工、管理者，以及汽车经销商下的服务人员。
- 核心场景：学习文化、提交案例、行为规范共创、查案例、沉淀实践、辅助决策。
- 产品边界：既是新服务理念官网，也是服务实践知识库，同时提供一线员工的 Workshop 共创机制，并通过 Hermit 提供领域问答和推荐。
- 阶段定位：企业文化数字平台。
- 当前优先级：先确定框架、页面内容定义、后台管理方式和后续维护模式。

## Workshop / 共创机制

共创模块首期不做大而全论坛，也不先做开放式案例投稿，而是聚焦一线岗位 Do & Don't 清单。

Do & Don't 内容基于服务理念，面向特定一线岗位，在实际执行中明确：

- 什么可以做
- 应该怎么做
- 什么绝对不能做

首期一线岗位范围包括：服务顾问、理赔顾问、休息区服务专员、备件人员、维修人员、洗车人员、其他后台支持人员。

共创模块前台由三个区域组成：

- 公共可见区域：展示已发布的 Do & Don't 执行指南和贡献榜单，榜单展示“门店 + 个人姓名”。
- 提交区域：表单式提交入口，一线人员和品牌方业务人员均可长期开放提交。
- 个人区域：查看自己的提交内容、草稿箱、审核状态和历史记录。

共创审核流程：

```text
用户提交
-> AI / 工作流初审（格式、重复性、内容完整性）
-> 初审通过后进入品牌方管理员审核
-> 审核通过后发布到公共可见区域
-> 成为培训、指导和执行指南内容
```

后台维护先保持极简，仅设置一个角色：品牌方管理人员，即最高管理员。

更多产品定义见：[Lighthouse 企业文化数字平台共创机制方案](docs/lighthouse-workshop-co-creation-report.md)。

## Hermit / 路引

Hermit 是汽车品牌售后服务文化领域的智能助手，不是窄 FAQ，也不是当前阶段的自治 Agent。

如果用户问题属于平台领域，Hermit 应尽量回答。领域范围包括新服务理念、Heart 原则、行为规范、汽车售后服务场景、经销商和一线实践、案例查找与比较、规范文件查询、话术或清单推荐、服务沟通场景、理念推进、案例提交、共创机制和实践沉淀。

回答形态应支持：

- 直接回答
- 理念依据
- 相关案例或规范文件推荐
- 下一步行动建议

## 技术栈

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4
- ESLint 9

## 本地开发

```bash
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 常用命令

```bash
npm run dev    # 启动开发环境
npm run lint   # 代码检查
npm run test   # 运行 Vitest 服务层测试
npm run db:generate # 生成 Prisma Client
npm run db:migrate  # 执行 MySQL 迁移（需要 DATABASE_URL）
npm run db:seed     # 写入 Demo Brand / 用户 / 管理员种子数据
npm run build  # 生产构建
npm run start  # 启动生产服务
```

## 目录结构

```text
docs/
  lighthouse-workshop-co-creation-report.md  # 共创机制方案汇报文档
  plans/
    2026-05-14-lighthouse-production-architecture-v0.1.md
    2026-05-14-lighthouse-code-architecture-phase1-roadmap.md
    2026-05-15-lighthouse-data-model-v0.1.md
    2026-05-16-lighthouse-phase1-implementation-plan.md
src/
  app/
    page.tsx                  # Mirror 首页
    heart/page.tsx            # Heart
    action/page.tsx           # Action
    workshop/page.tsx         # Workshop 共创 demo
    hermit/page.tsx           # Hermit
    mirror/pang-dong-lai/     # 胖东来案例页
    api/chat/route.ts         # Hermit 对话 API
  components/
    layout/                   # AppShell / Navigation / Header
    hermit/                   # ChatPanel / ChatInput / MessageBubble
    ui/                       # FeatureCard 等 UI 组件
  lib/
    hermit/                   # RAG 检索、系统提示词与知识源
scripts/
  build-knowledge.ts          # 生成 Hermit 知识向量
```

## 当前实现状态

- 已有 `Heart / 本心`、`Mirror / 镜鉴`、`Action / 笃行`、`Workshop / 共创`、`Hermit / 路引` 页面或预览内容。
- `Hermit` 已具备基于本地知识源的 RAG 对话链路。
- `Workshop / 共创` 已接入 Phase 1 API：提交、AI 初审占位、管理员审核、编辑后发布、公共指南和贡献榜单。
- 后台管理页位于 `/admin/workshop`，当前使用品牌方最高管理员占位身份。
- 数据持久化基于 Prisma + MySQL；本地执行迁移、种子和运行时 API 需要 `DATABASE_URL`。
- Phase 1 运行环境假设见：[Lighthouse Phase 1 Runtime Assumptions](docs/deployment/lighthouse-phase1-runtime-assumptions.md)。

## 近期技术优化（2026-03-02）

- 修复全部 ESLint errors（含 JSX 未转义字符）。
- 清理未使用导入/变量，消除对应 warnings。
- 将 `heart / action / hermit` 预览图从 `<img>` 升级到 `next/image`。
- 移除 `AppShell` 中 `style jsx`，改为 Tailwind 响应式写法。
- 新增移动端导航抽屉、可用搜索和通知面板交互。
- 更新 `html lang` 为 `zh-CN`，统一品牌标题为 `Lantern | Lighthouse`。

## 下一步建议

- 将首页调整为 `Heart / 本心`，使平台第一入口回到服务理念。
- 将 `Workshop / 共创` demo 接入真实数据结构、服务端持久化和管理员审核后台。
- 设计管理员审核后台、发布流程和驳回反馈模板。
- 将已发布 Do & Don't 内容纳入 Hermit 推荐与知识源规划。
- 将 `public/` 大尺寸图片继续按展示尺寸重采样，降低首屏图片负载。

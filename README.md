# Lantern (Lighthouse)

Lighthouse（灯塔）是面向汽车品牌售后体系的企业文化数字平台。平台服务于品牌方售后部门员工、管理者，以及汽车经销商下的一线服务人员，核心目标是帮助用户学习新服务理念、查阅标杆与实践案例，并通过领域智能助手辅助理解和决策。

当前产品主场景是“学习、查阅和实践沉淀”，同时提供领域智能问答与文化游戏入口。

## 产品结构

Lighthouse 当前围绕以下板块展开：

- `Heart / 本心`：新服务理念官网与学习入口，承载“我们相信什么”。
- `Mirror / 镜鉴`：外部标杆案例与行业观察，承载“别人有哪些值得参考的实践”。
- `Action / 笃行`：内部服务实践案例库，承载“我们已经做出了什么”。
- `Games / 文化游戏`：可选的文化学习与互动入口。
- `Hermit / 路引`：领域智能助手，基于理念、案例、规范与实践内容辅助理解、查询和判断。

`Workshop / 共创` 板块已下线，历史方案与数据模型保留在仓库中作为迁移和审计参考；对应页面、导航、搜索和 API 均不再提供服务。

## 当前产品定位

- 目标用户：汽车品牌方售后部门员工、管理者，以及汽车经销商下的服务人员。
- 核心场景：学习文化、查案例、沉淀实践、辅助决策。
- 产品边界：既是新服务理念官网，也是服务实践知识库，并通过 Hermit 提供领域问答和推荐。
- 阶段定位：企业文化数字平台。
- 当前优先级：先确定框架、页面内容定义、后台管理方式和后续维护模式。

## Hermit / 路引

知识中台的资源模型、CLI/MCP、首次导入和搜索切换说明见 [知识服务使用说明](docs/knowledge-hub.md)。首期不新增账号与权限，默认关闭页面内容切换。

Hermit 是汽车品牌售后服务文化领域的智能助手，不是窄 FAQ，也不是当前阶段的自治 Agent。

如果用户问题属于平台领域，Hermit 应尽量回答。领域范围包括新服务理念、Heart 原则、行为规范、汽车售后服务场景、经销商和一线实践、案例查找与比较、规范文件查询、话术或清单推荐、服务沟通场景、理念推进和实践沉淀。

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
  content/
    action-canwu-cases/      # 已确认、待进入 Action / 笃行的参悟案例内容源
  lighthouse-workshop-co-creation-report.md  # 已下线 Workshop 历史方案（归档）
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
    games/page.tsx            # 文化游戏入口（按功能开关显示）
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

- 已有 `Heart / 本心`、`Mirror / 镜鉴`、`Action / 笃行`、`Hermit / 路引` 页面，以及按功能开关显示的 `Games / 文化游戏` 入口。
- 已归档 `一般参悟案例-格式统一版` 最终稿，位置见 `docs/content/action-canwu-cases/2026-06-final/`；当前是待进入 `Action / 笃行` 的内容源，尚未作为结构化页面或管理端发布内容上线。
- `Hermit` 已具备基于本地知识源的 RAG 对话链路。
- Workshop 页面和 API 已下线，直接访问 `/workshop`、`/admin/workshop` 或旧 API 会返回 404；历史 Prisma 数据模型暂时保留以兼容已有迁移和数据。
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
- 将 `docs/content/action-canwu-cases/2026-06-final/` 中的 20 个最终参悟案例转换为 `Action / 笃行` 结构化内容。
- 继续完善 `Action / 笃行` 的结构化案例与内容维护流程。
- 根据真实使用反馈完善 Hermit 推荐、检索和知识源维护。
- 将 `public/` 大尺寸图片继续按展示尺寸重采样，降低首屏图片负载。

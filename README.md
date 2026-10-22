<img src="public/nav-lighthouse-transparent.png" alt="灯塔标志" width="32" align="right">

# lighthouse（灯塔）

**让服务理念有据可查，让一线实践成为共同的经验。**

灯塔是面向汽车品牌售后体系的服务文化数字平台，服务于品牌方员工、管理者和经销商一线服务人员。它把服务理念、外部标杆与内部案例放在一起，帮助使用者理解原则、查阅依据，并通过路引 AI 问答讨论具体的服务问题。

[了解产品](#产品与场景) · [访问与使用](#访问与使用) · [本地开发](#本地开发) · [维护与部署](#维护与部署) · [文档导航](#文档导航)

## 产品与场景

| 入口 | 用途与当前状态 |
| --- | --- |
| **本心 / Heart**（首页） | 阅读品牌价值框架与服务理念，理解服务中的价值原则。 |
| **镜鉴 / Mirror** | 查阅外部标杆、观察与案例，理解做法及其适用条件。 |
| **笃行 / Action** | 回看内部服务中的选择与权衡；可见案例取决于发布状态和访问权限。 |
| **路引 / Hermit** | 围绕具体问题查资料、讨论做法，推荐文档并在页内阅读；支持临时参考附件。 |
| **启航 / Games** | 当前为两款文化游戏的预告，尚未开放游玩；可通过功能开关隐藏入口。 |
| **资料维护** | 有知识管理权限的员工在 `/admin/knowledge` 维护目录、资料与版本；访客不可使用。 |

例如，面对“是否应该为取送车司机设立休息区”，可以先读本心中的理念依据，再查阅笃行中的同题案例，最后把本店的场地、人员和服务条件交给路引继续讨论。案例提供判断参考，具体做法仍需结合现场条件确认。

### 路引与知识如何配合

路引面向汽车售后服务文化领域，回答直接呈现在对话中。它按需查看知识中台的目录、资料信息与正文，推荐相关文档，并支持围绕正在阅读的文档追问。当前检索链路不依赖向量化模型或 embedding 配置。

知识中台为页面、搜索和路引提供已发布资料、版本及引用位置。临时上传的 PDF、DOCX、TXT、Markdown 用于当前对话参考，不会自动发布到知识库。扫描 PDF 的 OCR 与旧版 DOC 不在当前支持范围内。

仓库已保留并接入 **18 个最终参悟案例**的源文件、生成数据和页面映射。部署后的笃行从知识中台读取内容，不能用仓库文件数量推断线上已发布或访客可见的数量；首次初始化的这批案例默认为内部可见。

`Workshop / 共创` 已下线，历史方案和数据模型仅供追溯。功能变化见 [CHANGELOG](CHANGELOG.md)；本 README 描述当前分支的代码与使用约定，实际环境的部署和验收状态需另行确认。

## 访问与使用

业务使用者从所在组织提供的灯塔地址进入。访问方式由部署配置决定；员工登录失败或配置不完整时，不会自动开放访客访问。

| 访问方式 | 配置选择 | 使用范围与指南 |
| --- | --- | --- |
| 访客访问 | `AUTH_MODE=guest` | 无需员工账号，浏览公开发布资料、使用路引和临时附件；不开放知识管理、员工 CLI/MCP。[访客部署说明](docs/deployment/lighthouse-guest-mode.md) |
| IAM 登录 + 中台角色 | `AUTH_MODE=iam`、`IAM_AUTHORIZATION_SOURCE=portal` | IAM 验证身份，中台提供灯塔角色；未分配已知角色的账号不开放员工访问。[组合模式说明](docs/deployment/lighthouse-iam-portal.md) |
| IAM 登录 + 账号权限同步 | `AUTH_MODE=iam`、`IAM_AUTHORIZATION_SOURCE=sync` | 使用 IAM 同步的账号与权限；这是 `.env.example` 的默认配置。[同步模式说明](docs/deployment/lighthouse-iam-direct.md) |
| 旧门户登录 | `AUTH_MODE=portal` | 保留既有环境兼容与回滚路径，使用完整门户契约。[旧门户说明](docs/deployment/lighthouse-access.md) |

当前[部署约定](docs/deployment/production-environments.md)为生产使用访客模式、测试联调 IAM 登录与中台角色；这不代表真实环境已完成配置或验收。访客只能读取公开且符合发布、有效期规则的内容，内部资料不会因启用访客模式自动公开。

员工如需在自己的 AI 工具中查阅灯塔知识，可使用独立的 [lighthouse CLI / MCP 客户端](packages/lighthouse-client/README.md)，经浏览器授权获得知识只读能力。仓库中的 `hub`、`hub:mcp` 是直连数据库的可信运维工具，不作为员工客户端分发。

## 本地开发

### 环境前提

- **Node.js 24 与 npm**：应用声明的最低版本为 20.9.0；完整路引载体按 Node.js 24 构建和使用，统一使用 24 可覆盖两者。
- **独立的 MySQL 开发库**：准备数据库连接和迁移权限，不复用测试或生产业务库。SQLite 仅用于独立知识维护，不替代当前站点的 MySQL 前提。
- **访问模式与私密配置**：员工模式需要相应 IAM / 中台接入条件；下面以不依赖员工账号的本地访客模式说明启动路径。
- **路引依赖**：完整对话还需要匹配的 DSH 运行载体、可用模型网关，以及已发布且当前身份可见的知识。

### 1. 安装依赖并准备配置

在仓库根目录执行：

```sh
npm ci
cp .env.example .env
```

Windows PowerShell 可用 `Copy-Item .env.example .env`。已有配置时保留原文件；不要直接覆盖。Prisma 默认读取 `.env`，知识维护脚本会优先读取 `.env.local`，再读取 `.env`；避免两个文件中的数据库地址互相冲突。

编辑 `.env`，将以下字段替换为本地配置，其余字段按需要保留：

```dotenv
AUTH_MODE=guest
LIGHTHOUSE_DEPLOYMENT_ENV=development
LIGHTHOUSE_ORIGIN=http://localhost:3000
AUTH_ALLOW_LOCAL_HTTP=true
AUTH_TEST_HTTP_ORIGIN=
AUTH_ENCRYPTION_KEY=填写本开发环境独立且固定的32字节Base64密钥
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/lighthouse_dev
KNOWLEDGE_HUB_ENABLED=true
KNOWLEDGE_HUB_DRIVER=mysql
```

密钥占位文字必须替换为随机生成的有效值，并保存在本机私密配置中。此 HTTP 配置仅供 `npm run dev` 的回环地址调试；部署环境请使用对应的部署模板。

### 2. 准备数据库与知识

```sh
npm run db:generate
npm run db:deploy
npm run hub:initialize -- --dry-run
```

确认目标是**全新空开发库**并核对预览清单后，在首次访问站点前执行初始化：

```sh
npm run hub:initialize -- --apply
```

初始化提供白皮书、标杆材料、18 个参悟案例及两个 Skill，共 22 项资源和 4 个目录。它保留各项资料的可见性，访客看不到内部案例。已有库升级只执行所需迁移，保留内容和版本，不重复初始化，不使用 Demo seed 或 `hub:bootstrap` 代替升级步骤。

### 3. 启动与验证

```sh
npm run dev
```

打开 `http://localhost:3000`，确认本心和当前身份可见的资料能够读取。检查 `/api/health/ready` 应直接返回 200；`/api/health/live` 只表示进程存活。就绪检查通过仍需单独验证路引回答和附件读取。

要使用完整路引，按[运行载体说明](docs/deployment/hermit-runtime-package.md)准备与当前平台匹配的 DSH `0.2.0-rc.2` 载体，放在 `runtime/hermit-dsh`；本地开发也可用 `HERMIT_DSH_ROOT` 指向已构建目录。保持 `HERMIT_RUNTIME=dsh`，配置 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 及所需 API mode，重启服务后验证。仅克隆应用仓库不会得到 DSH 载体或模型凭据。

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务。 |
| `npm test` / `npm run lint` / `npx tsc --noEmit` | 测试、代码规范和类型检查。 |
| `npm run db:generate` | 生成 Prisma Client。 |
| `npm run db:migrate` | 在开发库创建和应用迁移；部署使用 `db:deploy`。 |
| `npm run db:deploy` | 向指定数据库应用已有迁移。 |
| `npm run hub:initialize -- --dry-run` | 只读预览首次知识初始化清单。 |
| `npm run build:knowledge` | 校验静态知识文本，不生成向量。 |
| `npm run build` / `npm run start` | 完成构建、知识与字体检查及 standalone 准备，再启动生产服务。 |
| `npm run check:hermit-runtime` | 检查 DSH 载体文件、版本和平台；自定义 `HERMIT_DSH_ROOT` 须显式设到终端环境，此检查命令不读取 `.env` 文件。 |
| `npm run releases:check` | 检查版本源、包版本和 CHANGELOG 一致性。 |

## 维护与部署

**维护知识**：准备资料 → 标准化与校验 → 导入草稿 → 预览核对 → 显式发布。知识管理员通过资料维护入口操作，上传不会自动发布。参见[资料标准化](docs/knowledge-standardization.md)与[文件管理器](docs/knowledge-file-manager.md)。

**部署应用**：按[生产与测试部署流程](docs/deployment/production-environments.md)选择模板、准备匹配版本的应用与运维镜像，完成备份、迁移、升级和就绪验证。新建空环境与已有环境升级使用不同步骤；已有环境保留原数据库、卷、知识版本和密钥。完整路引还需检查载体、模型网关和可见知识，不能把构建成功当作业务验收通过。

**维护版本**：功能与修复记录在 [CHANGELOG](CHANGELOG.md)，由 [releases.json](src/content/releases.json) 生成。交付版本、提交与内网测试/生产部署分别记录，规则见[版本与内网交付规范](docs/release-notes.md)。

## 文档导航

| 工作内容 | 阅读入口 |
| --- | --- |
| 品牌理念与知识文本 | [品牌知识源](docs/brand/README.md)、[价值观白皮书](docs/brand/精诚服务品牌价值观纲领白皮书.md) |
| 产品视觉与交互 | [设计规范索引](docs/design/README.md)、[路引产品定义](docs/design/hermit-authoritative-definition.md)；设计定义与已实现状态分开核对 |
| 内容来源与案例映射 | [内容目录](docs/content/README.md)、[案例 manifest](docs/content/action-canwu-cases/2026-06-final/manifest.json)、[Action 实现](src/app/action) |
| 知识模型与维护工具 | [知识服务](docs/knowledge-hub.md)、[资料标准化](docs/knowledge-standardization.md)、[文件管理器](docs/knowledge-file-manager.md) |
| 员工外部工具 | [CLI / MCP 客户端](packages/lighthouse-client/README.md) |
| 路引构建与验收 | [运行载体](docs/deployment/hermit-runtime-package.md)、[业务验收](docs/deployment/hermit-business-acceptance.md) |
| 环境部署与交付 | [部署流程](docs/deployment/production-environments.md)、[版本规范](docs/release-notes.md)、[内网 AI 更新指南模板](docs/deployment/ai-source-update-guide.md) |
| 网页隐形水印 | [公共服务接入、环境配置与验收](docs/deployment/lighthouse-web-watermark.md) |
| 开发协作 | [AGENTS.md](AGENTS.md)、[GitHub Issues](https://github.com/KeithChen51/Lantern/issues) |

部分知识维护与路引文档保留了首期实现和历史验证记录。涉及登录、权限、存储与部署时，以当前[访问模式](#访问与使用)及其对应部署指南为准，不沿用旧的共享管理密码、无账号假设或 SQLite 站点部署说明。

### 代码导航

技术栈：Next.js 16 App Router、React 19、TypeScript 5、Tailwind CSS 4、Prisma 6 / MySQL；测试使用 Vitest，路引通过独立 DSH 载体调用模型与知识工具。

```text
src/app/                   页面与 API；根页面为本心
src/components/            共享布局、界面组件和路引交互
src/modules/               认证、内容、知识中台、会话等业务模块
src/infrastructure/        数据库等基础设施
src/lib/hermit/             路引提示词、知识源和工具支持
src/config/                功能开关
src/content/releases.json   唯一版本来源
prisma/                    数据模型与迁移
scripts/                   知识维护、载体打包、构建及部署工具
packages/lighthouse-client/ 员工 CLI / MCP 客户端
skills/                    随项目维护的知识标准化与案例参悟 Skill
docs/                      品牌、产品设计、内容与部署文档
```

## 参与维护

需求使用 GitHub Issues 或项目指定的内网 CODING 事项记录，开发前先查重。日常变更从最新 `dev` 创建工作分支，经验证后提交 PR 到 `dev`；纯文档修订按实际范围检查内容、链接和差异。完整协作约定见 [AGENTS.md](AGENTS.md)。

`dev` 集成、`main` 交付和实际部署是不同状态。进入 `main` 前需要完成交付评估；内网测试与生产部署另行验收。README 不维护重复的待办清单，后续工作以 Issue 和评审记录为准。

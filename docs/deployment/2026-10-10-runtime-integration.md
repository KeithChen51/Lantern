# 2026-10-10 运行包与内网流水线整合评估

## 发布范围

关联 #10、#11、#18、#22，整合原 PR #19 与内网流水线工作树。
包含 SQLite 知识存储、Hermit Linux 独立运行时、业务验收脚本、运行包完整性及许可证、聊天/阅读滚动修复，以及内网 dev 镜像构建和已有构建故障修复。
保留当前主线的知识文件管理、标准化 Skill 和版本通知。忽略七月两条旧离线部署分支，不引入旧草稿。

## 整合修复

- 同时保留版本通知脚本、Skill 检查、bootstrap 与运行时脚本。
- MySQL 与 SQLite 导入均在同一存储事务中检查、导入和发布，重复导入不覆盖人工维护内容。
- 独立 CLI 携带内置 Skill 的完整可分发文件，排除 node_modules 和依赖应用源码的集成测试。
- 后台文件管理器仍使用 MySQL；SQLite 模式所有管理 API 明确返回 503，避免读写两套数据库。SQLite 管理使用 CLI/MCP。
- 旧 SQLite 卷缺少 visibility 时，案例默认 internal、其他资源默认 public，保留显式可见性。
- Linux Shell 文件固定 LF，修复 Windows 暂存后 pipefail 换行错误。

## 本轮验证

- npm ci 与 Prisma 6.19.3 客户端生成通过。
- npm test：46 个文件、192 项测试通过。浏览器布局测试指定本机 Chrome；默认 Edge 未产生预期 DOM，不计为通过。
- npm run lint、npx tsc --noEmit、git diff --check 通过。
- npm run build：Windows 生产构建、预构建知识校验、standalone 与运行时复制通过。
- 真实 DSH 运行包：正式工具参数注册、工具调用、流式回答、取消通过；本轮使用确定性本地模型服务，不代表真实业务回答质量复验。
- 独立打包 CLI：SQLite 导入发布 23 个资源（含标准化 Skill），新进程重复导入全部跳过。
- standalone HTTP：首页、路引、更新历史、资源列表、白皮书读取、完整 Skill ZIP 下载均返回 200。
- 本机 Linux Docker 使用 Node 24.18.0 / npm 11.16.0，真实执行 scripts/intranet/build.sh：14 项离线 SHA-256 校验、依赖安装、离线 Prisma 生成、DSH 工具/文本/取消 smoke、生产构建、standalone 和 CLI 打包通过。使用本机公共 Node 镜像及 npm 源，未访问或推送内网镜像仓库；不等于内网 Jenkins 重跑通过。

## 数据、配置、部署与回滚

本次不新增 MySQL migration；现有主线的知识管理迁移仍须先执行。MySQL 保持应用默认驱动，使用 DATABASE_URL 和 hub:bootstrap。SQLite 是显式单实例模式，使用 KNOWLEDGE_HUB_DRIVER=sqlite 及持久化 KNOWLEDGE_HUB_SQLITE_PATH，通过 knowledge-cli/import.cjs --publish 初始化。

DSH 部署要求 Node 24、匹配平台的内置 runtime、HERMIT_BUNDLE_REQUIRED=true。模型和 embedding 凭证只在运行时提供；知识索引为 Qwen/Qwen3-Embedding-8B / 4096 维。内网流水线只构建并推送 dev/dev-提交号 镜像，不部署容器或迁移数据库。

需要文件夹、回收站、浏览器上传等后台文件管理功能时选择 MySQL；SQLite 不提供这些能力。附件仍为单进程短期暂存。不同存储驱动间不自动迁移。回滚前备份知识卷，切回旧镜像并保留数据；不得以重复初始化覆盖已维护知识。

保持现有版本 1.0.0，本轮不自动改版本号或创建标签。main 合并只表示代码发布，内网推送、部署和真实业务验收另行执行。原 PR #19 的 10 月 8 日真实模型/容器证据作为历史依据，不冒充本轮复验。

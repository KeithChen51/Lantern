# 路引独立运行时与 Linux Docker 交付

关联 #18、#11、#10。路引是知识中台的内置 AI 示范应用；本交付将所需 DSH 执行依赖置于灯塔包内，不携带工作台、个人配置或会话。

## 构建与产物

要求 Node 24。DSH 固定 `0.2.0-rc.2`，来源提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。产物记录来源、系统/架构和依赖；必须在目标平台构建，Windows 产物不能用于 Linux。

本机（已有同版本 DSH 构建，仅构建阶段需要）：

```powershell
npm ci
npm run package:hermit-runtime -- --source 'DSH构建目录绝对路径' --output runtime/hermit-dsh
npm run check:hermit-runtime
npm run test:hermit-runtime
$env:HERMIT_BUNDLE_REQUIRED='true'
$env:HERMIT_KNOWLEDGE_USE_PREBUILT='true'
npm run build
```

部署后默认从工作目录的 `runtime/hermit-dsh` 加载。`HERMIT_DSH_ROOT` 留空；仅开发时可显式覆盖为绝对路径。模型凭证、知识数据库及个人数据不进入运行时包。缺失或平台/版本不一致会明确失败。

`HERMIT_BUNDLE_REQUIRED=true` 是部署构建要求：缺运行时就失败，不能产生一个看似完整、实际上还依赖开发机的包。常规 legacy 开发仍允许不构建 DSH。

## Linux x64 / Docker

`Dockerfile.hermit` 分离 DSH 构建、灯塔构建和最终运行镜像。DSH 源码和开发依赖只在构建阶段出现；最终镜像只有 Next standalone、裁剪运行时、知识初始化/读取 CLI 及其内容源。Node 固定 24.11.1，构建使用 linux/amd64。

准备一个仅包含预构建 `knowledge-vectors.json` 的目录，通过命名构建上下文提供。此文件必须对应当前知识源和 embedding 模型；不把模型密钥作为 Docker build ARG。

```sh
export HERMIT_INDEX_DIR=/absolute/path/to/knowledge-index
# .env.runtime 仅用于容器启动，不进入构建上下文。
docker compose -f compose.hermit.yaml build
# 首次实例：显式导入并发布仓库公开知识。重复执行跳过已有资源。
docker compose -f compose.hermit.yaml run --rm lighthouse node knowledge-cli/import.cjs --publish
docker compose -f compose.hermit.yaml up -d
```

`.env.runtime` 配置 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`、必要的 API mode/额外头，以及 `EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL`。不要配置开发机的 `HERMIT_DSH_ROOT`。若数据库选 SQLite，使用镜像默认的 `/data/knowledge/lantern.sqlite` 和持久卷；`DATABASE_URL` 不应指向无关业务环境。

服务默认只映射 `127.0.0.1:3000`。按内网现有反向代理/访问控制提供入口；本包不新增 SSO 或用户级知识权限。资料仍按中台已发布/归档规则访问。

## 验收与运维边界

```sh
# 部署前在构建环境执行真实 DSH + 确定性模型的工具/文本/取消 smoke。
npm run test:hermit-runtime
# 已运行实例，真实网关和真实知识；CLI 必须指向同一存储。
npx tsx scripts/hermit-business-acceptance.ts --base-url http://127.0.0.1:3000
```

业务验收退出0只表示机器断言通过。仍需复核报告里的建议是否准确、引用是否适用、无依据时是否说明限制。网关401/403、缺知识服务或容器无法启动应记为阻塞，不可用模拟回答替代。

SQLite 仅作为单实例知识存储，其他业务模块仍有其原数据库要求。附件仍为单进程30分钟暂存，重启失效；这不是持久文件库或多实例共享方案。备份/恢复持久卷，保留旧镜像用于回滚；启动不会自动重导或覆盖人工维护知识。回退 legacy 可禁用 DSH，但附件/文档追问随之不可用。

## 本轮验收记录（2026-10-08）

- Windows 独立 carrier：真实 DSH 工具调用、文本输出、取消通过；不是实际模型回答质量验证。
- Next standalone 生产构建通过，内置 runtime 已复制到输出。
- SQLite 已导入 22 个已发布资源；HTTP 与独立打包 CLI 读取同一文档版本，完整 JSON 一致。
- 真实 embedding 检索命中取送车投诉案例，保留资源/版本 ID；冷启动实测约 45 秒，仍依赖网关响应时间。
- 知识片段 embedding 最多 4 路并发，维持原有相关性筛选规则。
- 自动化测试 154 项通过，浏览器样式测试使用本机 Chrome（Edge 在本环境无 headless 输出）。
- 真实模型网关仍返回 `401 not_authorized`，真实问答、文档追问及业务质量验收未通过，不能据此宣布正式可用。
- Linux x64 镜像构建通过；容器内真实 DSH 工具/文本/取消 smoke 通过，健康检查通过。
- 最终镜像约 204 MB；断网初始化 22 个知识资源通过；HTTP/容器 CLI 读取一致，重启后版本保留。
- 运行时附带许可证清单；部分上游包未附许可证正文，详见 `runtime-manifest.json.licenseInventory.missingThirdPartyLicenseText`，正式分发前需补齐。禁用的 MCP 包上游缺失两个默认 export，记录在 `unresolvedSourceExports`，不用于路引执行路径。

## 导入本轮验证镜像

这是一份待完成真实模型验收的候选镜像，不代表已发布或已部署到内网。

```sh
docker load -i lantern-hermit-linux-x64-20261008.tar
# 将模型与 embedding 配置放到 .env.runtime 后：
docker compose -f compose.hermit.deploy.yaml run --rm lighthouse node knowledge-cli/import.cjs --publish
docker compose -f compose.hermit.deploy.yaml up -d
```

部署 Compose 只引用现成镜像，不需要 DSH 源码、Node 工具链或知识向量构建目录。生产凭证通过 `.env.runtime` 注入；镜像不含开发机密钥。

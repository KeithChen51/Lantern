# 路引 DSH 接入与本机验证

关联需求：[GitHub #11](https://github.com/KeithChen51/Lantern/issues/11)。产品定义见 [路引权威定义](../design/hermit-authoritative-definition.md)。

## 运行前提

- Lighthouse 原框架和 Classic Amber 保持不变；回答在对话中，知识文档在页内阅读。
- 默认 `HERMIT_RUNTIME=legacy` 保留原模型链路。启用新链路需 `HERMIT_RUNTIME=dsh`、`KNOWLEDGE_HUB_ENABLED=true`。
- `HERMIT_DSH_ROOT` 指向本机已构建的 DeepSeek Harness 根目录。适配目标是 **0.2.0-rc.2**，必须有 CLI、SDK client/protocol、tools、llm-pi-ai 同版本构建；不能用 npm 上旧版 SDK 替换。
- 推荐 Node 24；DSH 要求 Node ^22.19 或 >=24，高于 Lighthouse 原最低要求。
- 模型沿用 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、现有 API mode 与额外 headers 配置。密钥只进入隔离子进程环境，不写入 patch 文件。
- 知识中台必须有可用存储与已发布知识，包含 `knowledge-heart-values`。当前 dev 的中台使用 Prisma；本机 SQLite 支持由 #10 独立交付，不能把本文件视作已合入 SQLite 的证明。

## 请求与工具边界

每次请求启动一个独立 DSH 子进程与临时 home/cwd，固定 sdk-minimal profile，不接受客户端指定的服务器路径、profile 或 DSH session。只暴露 `knowledge_search`、`knowledge_read`、`attachment_read`。知识查询沿用现有领域/相关性/证据门槛；知识读取不启用 maintenance 绕过；附件只能读取当前请求携带且属于当前浏览器 owner cookie 的 ID。

客户端使用 `/api/chat` 的 AI SDK UIMessage 流，`data-document` 由服务端真实读取文档后发送，客户端提供的工具结果不会作为可信来源重放。阅读区通过现有 `/api/resources/:id?version=...` 获取对应版本。

停止生成关闭该请求的 DSH 子进程。已有知识查询不支持在数据库/embedding 请求内部即时取消，仅在调用前后检查取消状态。运行限制为单进程最多 2 个 DSH 请求、每次 180 秒、最多 20 次工具调用；目前没有跨实例全局配额。

## 上传边界

首批 PDF（可提取文本）、Word **DOCX**、TXT、Markdown。旧 DOC、扫描 PDF 的 OCR 暂未提供。附件不会自动写入知识中台，也不放入 public 目录。

单文件 10 MiB、每个浏览器最多 5 个文件；解析后的文本在当前 Node 进程内暂存 30 分钟。重启、过期、多实例切换会失效，需要重新上传。当前实现适合本机与单实例联调；多实例部署前需替换为受控共享存储、统一配额，并结合正式认证确定访问边界。当前知识中台仍是受控实例内的共享已发布内容，不代表已实现用户级文档权限。

## 验证命令

```powershell
$env:HERMIT_DSH_ROOT='本机 DSH 构建根目录绝对路径'
node --import tsx scripts/hermit-dsh-smoke.ts
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Smoke 启动真实 DSH 子进程和确定性本地模型端点，验证工具调用、文本流、自定义网关 header 和取消；不读取公司凭证或知识。它不能代替真实网关、知识存储、浏览器的完整联调。

`prepare:standalone` 会复制 DSH 插件脚本；部署启动工作目录必须为 standalone 根目录，另行提供匹配版本的 DSH 安装路径。DSH 本体不打包进 Lighthouse。

## 本轮状态与待验收

- 真实 DSH + 本地确定性网关 smoke 通过，包括停止生成。
- 2026-10-02，现有真实模型网关探测返回 HTTP 403 / access_denied；真实模型联调受权限阻塞。
- 本机完整知识联调依赖 #10 或可用的 Prisma 数据库；尚未部署内网。
- 生产上线前还需确认正式认证、共享文件存储/清理、容量限额、进程异常终止后的临时目录清理与部署回滚。
- 回滚：将 `HERMIT_RUNTIME` 改回 `legacy` 并重启。附件与文档追问依赖 DSH，此时不可用；普通对话保留原链路。

### 本地验收补充

- TypeScript、ESLint、生产构建通过（使用已有 176 chunks 的预构建知识索引，未重新调用 embedding）。
- 33 个测试文件、142 项测试通过。全量套件中的 `lighthouse-form-runtime-contract.test.ts` 浏览器 fixture 无输出；在原工作区复现同样失败，未修改该测试或全局样式。
- 浏览器实际验证 `/hermit` 页面及 TXT 上传，从读取中到就绪；修复异步上传队列使用已清空 FileList 的问题。
- 文档推荐/读取流通过接口契约测试；真实知识存储与模型的完整浏览器联调仍受上述依赖阻塞，不能据此标记为已上线。

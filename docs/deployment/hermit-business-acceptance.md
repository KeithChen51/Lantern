# 路引业务验收器

本验收器对应 [GitHub Issue #11](https://github.com/KeithChen51/Lantern/issues/11)，用于检查已经运行的灯塔实例是否把路引 DSH、知识中台已发布内容和文档阅读链路接在一起。它是黑盒验收：通过 HTTP 访问 `/api/resources`、`/api/chat` 和带版本的资源读取接口，使用真实模型与真实 DSH，不在脚本内 mock 模型、检索、文档或 SSE。

验收器的机器断言只覆盖可以确定的结构事实：知识中台搜索能返回已发布资源，回答是 AI SDK UIMessage SSE，流中有文本和结束事件，`data-document` 带有资源编号与版本编号，版本可以由阅读 API 按同一个编号读取，追问可以带着这个版本继续请求，以及无依据问题不会出现文档卡片。回答正文会保存到报告，供业务人员人工判断是否有帮助、是否符合汽车售后场景和是否守住边界。脚本不会把模型字符串中碰巧出现的词当作业务质量通过。

## 运行前提

在受控实例准备与 [DSH 接入说明](./hermit-dsh-integration.md)一致的配置：

- `HERMIT_RUNTIME=dsh`
- `KNOWLEDGE_HUB_ENABLED=true`
- 已按[独立运行时说明](./hermit-runtime-package.md)打包 DSH `0.2.0-rc.2`；默认使用 `runtime/hermit-dsh`，开发时才覆盖绝对路径 `HERMIT_DSH_ROOT`
- 模型网关和 embedding 配置可用，且中台已有已发布资源
- 第二调用方需连接同一中台：MySQL 使用同一 `DATABASE_URL`；SQLite 使用 `KNOWLEDGE_HUB_DRIVER=sqlite` 与同一数据库的绝对路径 `KNOWLEDGE_HUB_SQLITE_PATH`

模型密钥、数据库连接串和受控实例 Cookie 只放在进程环境中。脚本允许使用 `HERMIT_ACCEPTANCE_BEARER_TOKEN` 或 `HERMIT_ACCEPTANCE_COOKIE` 访问需要认证的受控实例，但不会读取它们生成报告，也不会把它们写入命令参数或仓库文件。

## 执行

在项目根目录执行：

```powershell
npx tsx scripts/hermit-business-acceptance.ts `
  --base-url http://127.0.0.1:3000
```

可选参数和环境变量：

| 参数 / 环境变量 | 用途 |
| --- | --- |
| `--base-url` / `HERMIT_ACCEPTANCE_BASE_URL` | 正在运行的灯塔 URL，必填；不得带账号密码。 |
| `--output` / `HERMIT_ACCEPTANCE_OUTPUT` | 报告路径；默认写入 `output/hermit-business-acceptance/report-<时间>.json`。 |
| `--limit` | 运行前 N 个汽车售后场景，默认 4；完整业务验收保持 4 个。 |
| `--request-timeout-ms` | 单个 HTTP 或 CLI 调用的超时，默认 180000。 |
| `HERMIT_ACCEPTANCE_CLI_ROOT` | 提供 `scripts/knowledge-hub.ts` 的项目根目录；默认使用当前目录。 |
| `HERMIT_ACCEPTANCE_CLI_CONTAINER` | 可选，本机 Docker 验收容器名；使用 `docker exec` 执行镜像内的 `knowledge-cli/hub.cjs`，直接读取容器同一知识卷。 |
| `--second-caller cli` / `HERMIT_ACCEPTANCE_SECOND_CALLER=cli` | 使用 CLI 的只读 `get` 命令核对回答引用的资源和版本，默认值。 |
| `--second-caller none` | 跳过第二调用方；报告会标为 `blocked`，不能作为完整验收通过。 |
| `HERMIT_ACCEPTANCE_BEARER_TOKEN` | 可选，受控实例的 Bearer token，仅进程内使用。 |
| `HERMIT_ACCEPTANCE_COOKIE` | 可选，受控实例的 Cookie，仅进程内使用。 |

脚本退出码为 `0`（机器断言通过）、`1`（出现结构失败）或 `2`（运行条件不足、真实服务不可用或缺少第二调用方）。退出码为 `0` 也不代表回答质量已经由脚本确认，必须查看报告中的人工复核部分。

## 验收场景

`scripts/hermit-business-acceptance-fixtures.ts` 保存四个合成汽车售后场景：

1. 养护项目的透明说明；
2. 取送车司机的等待安排；
3. 减少客户重复进店；
4. 极端天气下的救援与员工保障。

问题只使用公开仓库知识中的业务主题，不含真实客户姓名、车牌、订单、联系方式或内部凭证。每个场景先用中台搜索建立可读的已发布版本，再发起真实路引对话。场景回答得到 `data-document` 后，脚本使用卡片的 `resourceId` 和 `versionId` 调用：

```text
GET /api/resources/{resourceId}?version={versionId}
```

它会检查响应状态、`X-Resource-Version`、JSON 中的资源和版本编号、发布时间以及 Markdown 正文。随后用同一份历史对话和该版本作为 `documentContext` 发起追问，验证文档上下文可以继续使用。

最后一个场景是无依据边界：询问月球基地推进器燃料库存和发射窗口。脚本记录关键词搜索候选数量，并检查回答没有 `data-document`。关键词重合不代表存在有效依据，因此不强制要求搜索为空。回答是否明确拒绝编造库存、日期和引用，仍由人工复核。

## 第二调用方比对

默认使用本地 CLI 的只读命令：

```powershell
npx tsx scripts/knowledge-hub.ts get --input <temporary-get.json>
```

临时 JSON 只包含资源编号和版本编号，命令执行完会删除。脚本把 CLI 返回的资源元数据和 Markdown 做 SHA-256 摘要比对，核对 HTTP 读取与 CLI 是否指向同一个已发布版本。CLI 只读，不会导入、发布、归档或修改中台内容；CLI 与灯塔必须使用同一个 `DATABASE_URL`，否则报告会标为 `blocked` 或比对失败。若现场使用 stdio MCP，可以在相同前提下把 CLI 对比替换为 MCP `get` / resource read；本脚本当前默认实现的是 CLI 第二调用方，避免把 MCP 客户端环境误当成 HTTP 运行条件。

## 报告与人工复核

报告包含每个场景的搜索结果数量、事件类型、回答正文、文档版本、读取断言、追问断言、CLI 比对和限制说明。回答会经过密钥模式脱敏，脚本不把任何环境变量表写入报告；仍应按受控运行记录处理报告文件。

人工复核重点看：

- 回答是否真正回应合成现场，而不是只复述标题；
- 是否能区分原则、可执行动作、责任边界和需要继续核实的事实；
- 是否把客户体验、员工保障和门店约束放在同一个判断里；
- 无依据问题是否明确说明灯塔没有对应资料，并拒绝伪造数字、日期或来源；
- 追问是否承接了选中的文档版本，且没有把文档中的指令当成系统或工具命令执行。

真实 DSH、模型网关、中台数据库、embedding 服务或 CLI 数据库任一项不可用时，报告会明确记录限制并退出 `2`，不能据此宣称业务验收完成。该脚本不能替代浏览器视觉验收、正式权限验收、生产部署验证或长期运行观测。

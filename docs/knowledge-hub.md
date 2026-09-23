# 灯塔知识服务（首期，无账号依赖）

关联需求：<https://github.com/KeithChen51/Lantern/issues/4>。

知识中台属于灯塔底层能力。人员从现有搜索入口进入 `/search`，Agent 通过 CLI 或 stdio MCP 获取同一资源、版本和引用。维护也走本地 CLI/MCP，不增加一级导航、上传表单、登录页、用户、管理员或权限模型。

本期运行边界是维护者控制的数据库、CLI/stdio 进程和受控灯塔实例。HTTP 仅提供已发布内容读取，不提供匿名写入、交互读取或管理接口。启用实例内的已发布资源对该实例访问者可见；本期没有访问隔离，不能据此宣布具备多用户权限能力。账号、企微、集团 SSO 及授权接入后续独立建设。

## 内容模型

- `HubResource`：稳定编号、五种类型、标题/摘要/标签、来源、业务范围、归档状态、发布指针。
- `HubVersion`：不可变 Markdown、内容校验、版本内文件清单、版本内引用位置、发布时间及业务有效期。正文和附件共同决定内容身份；有效期也参与版本身份，避免无记录地改变历史依据。
- `HubRelation`：两个明确版本的依据、替代、相关或配套关系。
- `HubInteraction`：经用户同意回传的原始运行内容，独立存储，不能由资源搜索读取。
- `HubProvenance`：草稿版本与交互记录的多对多来源关系，可指定消息；资源接口不展开原始对话。
- `HubAudit`：导入、元信息修改、发布、归档、交互接收、归档来源关联记录。元信息保留修改前后值。当前不记录账号身份，不把客户端声明当登录身份。

五种类型为 `notice`（通知与规范）、`case`（案例与复盘）、`document`（知识文档）、`skill`、`tool`。白皮书属于 document；工具资源和 Skill 是可获取文件，不自动执行。

ID 使用 1–120 位字母、数字、点、下划线、连字符，首位为字母或数字，大小写敏感（新表使用 utf8mb4_bin）。导入脚本使用 `brand-whitepaper`、`brand-guide`、`case-<slug>`、`knowledge-<file-stem>`。旧格式 `action-case:<slug>` 应在客户端显式映射，不能每次导入生成新 ID。

## 初始化与内容切换

1. 配置 MySQL `DATABASE_URL`，执行 `npm run db:generate` 和 `npm run db:deploy`。CLI 自动读取当前目录 `.env.local`、`.env`；已有进程环境优先。不要用生产数据库跑测试。
2. `npm run hub:import-existing -- --dry-run` 检查导入清单，不写数据库。
3. `npm run hub:import-existing -- --publish` 首次导入并发布。省略 `--publish` 仅创建草稿，后续需要逐项显式 publish。脚本读取真实 Markdown 源文件，生成数据仅提供既有 slug/摘要/标签映射。已有 ID 一律跳过，防止旧仓库文件覆盖中台的新内容。
4. 确认 `brand-whitepaper`、`knowledge-heart-values` 和所有要保留旧链接的 `case-<slug>` 均已发布。
5. 在受控实例设置 `KNOWLEDGE_HUB_ENABLED=true` 并重启。不开启时保留现有页面和 RAG，资源 API 返回 503；CLI/MCP 仍可准备数据。

开关开启后：本心正文读取白皮书；笃行列表和详情读取资源版本；资源详情、搜索共用 Hub；路引的核心价值文案从 `knowledge-heart-values` 读取，检索候选也从已发布中台内容读取。页面使用动态读取，无长期页面缓存。发布提交后，新的页面读取和检索均选择新版本；正在进行的请求和显式历史链接保留其版本。

这是显式内容切换，不是按请求回退。中台开启但迁移不完整时，缺失资源会报错或 404，不把旧文件当作静默兜底。需要继续编辑中台内容时，使用 CLI/MCP；旧案例管理页属于既有体系，其修改不会反向覆盖中台。回退开关只恢复旧体验，不删除中台数据，也不把新内容反写旧源。

Mirror 等仍使用独立编辑布局的页面不在本次全量内容结构重构范围内；其参考 Markdown 可通过中台检索。完整页面字段化迁移需逐页验证，不能视为已经完成。

## CLI

从项目根目录执行，结果是 JSON，失败退出码为 1。直接供程序消费时用 `npx tsx scripts/knowledge-hub.ts`，避免 npm 自身的命令提示。

创建 `import.json`：

```json
{
  "id": "service-waiting",
  "type": "notice",
  "title": "等待服务指引",
  "source": "业务确认稿",
  "summary": "等待期间的告知与安排",
  "tags": ["等待", "服务"],
  "validity": "effective"
}
```

```sh
npm run hub -- import --input import.json --markdown waiting.md
```

该命令返回 `resourceId`、`versionId`、`version`、`duplicate`、`metadataChanged`、`processing`、`published`。校验、引用切分与持久化在一次操作内完成，成功返回 `processing=ready`；失败有明确错误，不返回伪成功。首期没有后台解析任务队列。

发布文件 `publish.json` 使用返回的确切版本：

```json
{"id":"service-waiting","versionId":"返回的版本编号"}
```

```sh
npm run hub -- publish --input publish.json
```

其他命令和请求格式：

| 命令 | 请求 |
| --- | --- |
| `search` | `{"query":"等待","sort":"relevance","limit":20,"offset":0}` |
| `get` | `{"id":"service-waiting"}`；可加 `versionId` 读历史已发布版本 |
| `preview` | `{"id":"service-waiting","versionId":"..."}`；本地读取草稿或归档版本 |
| `history` | `{"id":"service-waiting"}` |
| `archive` | `{"id":"service-waiting"}` |
| `relate` | `{"fromVersionId":"...","toVersionId":"...","kind":"based_on"}` |
| `read_interaction` | `{"id":"..."}`，仅本地维护 |
| `attach_provenance` | `{"versionId":"草稿版本","interactionId":"...","messageIds":["m1"]}` |

更新仍使用相同资源 ID，可传入 `baseVersionId` 防止覆盖并发修改。相同正文/附件/有效期不产生新版本；元信息变化仅记录审计。重新提交旧内容会返回原版本，不能通过重复导入把旧版本重新编号为最新。

`files` 可包含 `{path, mediaType, contentBase64}`，path 是包内相对路径，拒绝目录穿越和重复路径。最多 50 个文件，编码后合计约 16 MB；Markdown 最多 200 万字符。附件存于版本 JSON，适合首批小型 Markdown/Skill 包，大型二进制资源后续迁移对象存储。获取资源 JSON 包含文件内容；网页也提供原文和附件下载。浏览器仅内联常见栅格图片，HTML/SVG/脚本作为下载，不在站点同源执行。

## 查询和版本规则

- 默认排除草稿和归档资源；返回最新的已发布、已到生效时间、非失效版本。最新适用版本过期后不自动复活旧政策。
- 未来生效的新版本不会提前替代当前版本；明确历史版本可读取已发布旧版，即使已失效；资源归档后只能通过本地 preview 查看。
- `includeInactive=true` 允许查询最新发布指针指向的未来/失效版本，仍不包含归档和草稿。该选项不是“查询所有历史版本”。
- `sort` 支持 `relevance`、`published`、`updated`，并以资源编号打破平局。`limit` 为 1–100。
- 首版搜索是中文双字片段与关键词匹配，标题和元信息有较高权重；不是语义检索或本体推理。当前在服务层排序，适合首批小规模资源，后续规模增长需数据库索引/专用检索。
- 每个搜索结果包含资源编号、版本编号、来源、片段及引用行号。引用绑定不可变版本，不绑定可重建的向量切片。
- 路引保留既有领域与相似度门槛。先用中台检索候选，再调用现有 embedding 配置并应用既有 RAG 门槛；不把关键词分数冒充向量相似度。首次读取新片段需要 embedding 调用，缓存只在进程内。词法候选预筛选可能漏掉没有共同词语的同义表达；空查询或无候选时不调用 embedding。Hub 数据库或 embedding 出错时，路引明确返回 503，不静默使用过时文件或无依据回答。

## MCP（stdio）

使用标准 MCP SDK。客户端配置的示例（替换绝对路径；cwd 指向项目根目录）：

```json
{
  "mcpServers": {
    "lantern": {
      "command": "node",
      "args": ["--import", "tsx", "C:/path/to/lantern-app/scripts/knowledge-mcp.ts"],
      "cwd": "C:/path/to/lantern-app"
    }
  }
}
```

不同客户端的 cwd 配置支持不同；也可用本机启动脚本先切换到项目目录，再运行 `node --import tsx scripts/knowledge-mcp.ts`。数据库配置只放本机环境文件或客户端环境，不写进示例和仓库。

工具名称为 `lantern_<CLI命令>`。精确资源 URI 为 `lantern://resources/{id}/versions/{versionId}`，内容为 Markdown。维护工具只在本地 stdio 暴露，本期没有网络 MCP 服务和账号登录；CLI/MCP 不能被描述为已经支持企业用户访问隔离。

## 交互回传与归档

Agent 先说明回传范围和整理用途，并询问用户是否同意。拒绝或未回答不得调用回传工具。示例：

```json
{
  "source":"external-agent",
  "externalId":"conversation-123-part-1",
  "scope":"excerpt",
  "consent":{"granted":true,"at":"2026-09-23T08:00:00.000Z","purpose":"整理服务案例"},
  "messages":[{"id":"m1","role":"user","content":"用户同意回传的内容"}],
  "resourceVersions":[]
}
```

通过 `receive_interaction` 提交。相同来源/外部编号和内容返回同一记录；相同编号但不同内容返回冲突。重新提交时更新确认时间不会产生新内容，但用途、范围或消息变化必须使用新批次编号。可记录已使用的真实中台版本。

确认信息是客户端提供的声明，不是灯塔独立验证的用户点击。该记录不自动成为公共资源。整理者显式导入案例/文档草稿，使用 `attach_provenance` 关联选定消息，再发布。preview 返回来源交互与消息编号，可用 read_interaction 追溯原文；公开 get 不返回这些内部来源映射。交互读取仅在本地维护接口；资源查询不返回原始交互。

当前保留归档和审计，不提供硬删除/自动过期任务。真实运行数据的保留期限、删除与脱敏策略上线前需确定。本期没有自动对话采集、自动归档、用户权限或管理员账号。

## 验证

服务测试覆盖导入幂等、草稿隔离、发布/历史引用、并发重复提交、有效期、归档、引用、附件路径、排序、交互同意和归档来源。MCP 使用标准客户端与内存传输完成协议初始化、工具发现、导入、发布、搜索和资源读取；不是只测 mock 函数。

MySQL migration 是新增表，既有账号/对话/内容表不变。生产迁移、真实数据库导入与部署需要单独执行。内存事务测试不能替代 MySQL 实库验证。

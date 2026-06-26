# 管理端路引知识库管理页实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标：**在管理员后台增加路引知识库管理页面，让管理员能查看和勾选当前生效的知识渠道与具体知识文件，点击“保存并构建”后触发目标知识重建，同时查看路引所有对话持久化记录。

**架构思路：**把“管理员选择的知识源配置”和“实际构建出来的知识索引”分开管理。管理页负责维护启用状态、展示构建结果和对话日志；知识构建服务根据启用状态抽取已发布内容、生成 embedding 索引，并记录构建运行结果。对话记录直接复用现有 `ChatSession`、`ChatMessage`、`RetrievalTrace` 持久化模型，不新增一套聊天日志。

**技术栈：**Next.js App Router、TypeScript、Prisma / MySQL、管理员密码门户、Vitest、现有 Lighthouse UI primitives、OpenAI-compatible / 公司内部 embedding 接入、当前阶段本地 JSON 向量索引。

---

## 1. 已确认需求

用户提出的本轮目标：

- 管理员界面增加一个“路引知识库”管理页面。
- 页面能对知识来源进行管理。
- 页面显示目前生效中的知识渠道，例如本心、镜鉴、笃行等。
- 页面可以更细粒度地管理具体文件或具体内容，例如某个 Action 案例。
- 勾选后，点击“保存并构建”，后台对目标知识重新构建。
- 管理页面可以看到所有路引对话持久化记录。

结合上一轮已确认口径：

- v1 知识源只纳入已发布内容。
- v1 优先围绕 Heart / Mirror 理念材料和 Action 已发布案例。
- 后续以管理端发布版本为主，静态 Markdown 保留为参考、种子和兜底。
- embedding 公司有模型，但具体接入方式待确认。

## 2. 产品口径

### 2.1 页面入口

新增后台入口：

- 路径建议：`/admin/hermit-knowledge`
- 后台首页卡片名称：`路引知识库`
- 页面内两个主区域：
  - `知识源管理`
  - `对话记录`

不建议把它放进 Action 案例维护页里。Action 案例是内容维护，路引知识库是检索配置和构建运维，两者职责不同。

### 2.2 知识渠道

v1 渠道建议：

| 渠道 | 页面名称 | v1 是否启用 | 说明 |
|---|---|---:|---|
| Heart | 本心 | 是 | 服务理念、原则、价值观类材料。 |
| Mirror | 镜鉴 | 是 | 标杆、案例观察、外部参照类材料。 |
| Action | 笃行 | 是 | 已发布内部实践案例。 |
| Workshop | 共创 | 暂不启用 | 后续等 Do / Don't 证据等级确认后再接入。 |
| SOP / Norm | 规范文件 | 暂不启用 | 后续等权威等级确认后再接入。 |

页面可以展示暂未启用的未来渠道，但默认置灰，并标注“待证据等级确认”。

### 2.3 具体文件 / 内容管理

管理员需要能在渠道下看到更细粒度对象：

- 本心：静态 Heart Markdown、管理端已发布 Heart 内容。
- 镜鉴：静态 Mirror Markdown、管理端已发布 Mirror 内容。
- 笃行：静态 Action 种子案例、管理端已发布 Action 案例。

每一项至少展示：

- 名称。
- 来源类型：静态文件 / 管理端发布内容。
- 所属渠道。
- 发布状态。
- 最近更新时间。
- 当前是否启用。
- 最近一次构建状态。

### 2.4 保存与构建

页面动作拆成两个按钮：

- `保存选择`：只保存勾选状态，不重建。
- `保存并构建`：保存勾选状态，然后按当前选择重新构建路引知识索引。

建议 v1 先做同步构建：

- 点击后按钮进入 loading。
- 构建完成后展示成功 / 失败结果。
- 失败时展示可读错误，不改变上一次可用索引。

后续如果构建耗时明显，再升级为后台队列和轮询进度。

### 2.5 对话记录

对话记录作为只读视图：

- 列表展示所有 `ChatSession`。
- 点击某条会话后展示消息明细。
- 每条 assistant 消息如果有 `RetrievalTrace`，展示当时的检索 query、上下文摘要、来源快照。
- 可以按时间倒序分页。

v1 不做：

- 删除对话。
- 修改对话。
- 导出对话。
- 人工标注回答质量。

这些可以作为后续增强。

## 3. 数据模型设计

### 3.1 为什么不能只用 `KnowledgeDocument.status`

现有 Prisma 已有：

- `KnowledgeDocument`
- `KnowledgeChunk`

但它们更适合作为“构建产物”或“索引文档”，不适合直接承载管理员勾选状态。

原因：

- 勾选状态代表管理员意图。
- 构建结果代表系统执行结果。
- 可能出现“已勾选但构建失败”的状态。
- 也可能出现“以前构建过，但现在被禁用”的状态。

因此建议新增配置层。

### 3.2 新增知识源配置模型

建议新增 Prisma 模型：

```prisma
enum HermitKnowledgeSourceKind {
  CHANNEL
  STATIC_FILE
  CONTENT_ITEM

  @@map("hermit_knowledge_source_kind")
}

enum HermitKnowledgeChannel {
  HEART
  MIRROR
  ACTION
  WORKSHOP
  NORM

  @@map("hermit_knowledge_channel")
}

model HermitKnowledgeSourceConfig {
  id              String                    @id @default(cuid())
  sourceKey       String                    @unique @map("source_key")
  sourceKind      HermitKnowledgeSourceKind @map("source_kind")
  channel         HermitKnowledgeChannel
  sourceId        String?                   @map("source_id")
  title           String
  enabled         Boolean                   @default(true)
  metadataJson    Json?                     @map("metadata_json")
  lastBuiltAt     DateTime?                 @map("last_built_at")
  lastBuildRunId  String?                   @map("last_build_run_id")
  createdAt       DateTime                  @default(now()) @map("created_at")
  updatedAt       DateTime                  @updatedAt @map("updated_at")

  @@index([channel, enabled])
  @@map("hermit_knowledge_source_configs")
}
```

说明：

- `CHANNEL` 用于渠道级总开关，如 `channel:heart`。
- `STATIC_FILE` 用于具体静态文件，如 `file:src/lib/hermit/knowledge/heart-values.md`。
- `CONTENT_ITEM` 用于管理端发布内容，如 `content-item:<id>`。
- 渠道禁用时，其下具体文件即使勾选也不进入构建。

### 3.3 新增构建运行记录

建议新增 Prisma 模型：

```prisma
enum HermitKnowledgeBuildStatus {
  RUNNING
  SUCCEEDED
  FAILED

  @@map("hermit_knowledge_build_status")
}

model HermitKnowledgeBuildRun {
  id                   String                    @id @default(cuid())
  status               HermitKnowledgeBuildStatus
  triggeredBy          String?                   @map("triggered_by")
  selectedSnapshotJson Json                      @map("selected_snapshot_json")
  documentCount        Int?                      @map("document_count")
  chunkCount           Int?                      @map("chunk_count")
  indexPath            String?                   @map("index_path")
  errorMessage         String?                   @map("error_message") @db.Text
  startedAt            DateTime                  @default(now()) @map("started_at")
  finishedAt           DateTime?                 @map("finished_at")

  @@index([status, startedAt])
  @@map("hermit_knowledge_build_runs")
}
```

说明：

- 管理页顶部展示最近一次构建运行。
- 构建失败时保留错误信息。
- `selectedSnapshotJson` 记录当次构建使用了哪些渠道和文件，便于追溯。

### 3.4 向量索引存放位置

当前项目运行时 RAG 主要依赖本地 `knowledge-vectors.json`。

为了支持管理端构建，建议新增配置：

```env
HERMIT_KNOWLEDGE_INDEX_PATH=""
```

行为：

- 未配置时，开发环境沿用 `src/lib/hermit/knowledge/knowledge-vectors.json`。
- 配置后，构建写入该路径。
- 生产部署如果文件系统不可写，应挂载持久化目录，或后续改接公司内部向量服务。

注意：

- 不建议后台 API 直接调用 shell 脚本。
- 应把 `scripts/build-knowledge.ts` 里的核心逻辑抽成模块，脚本和 API 共同调用。

## 4. 后端设计

### 4.1 新增模块

建议新增：

- `src/modules/knowledge/hermit-admin.ts`
- `src/modules/knowledge/hermit-admin.test.ts`
- `src/modules/knowledge/hermit-builder.ts`
- `src/modules/knowledge/hermit-builder.test.ts`

职责：

- 枚举可管理知识渠道。
- 枚举渠道下可选文件和内容。
- 保存启用状态。
- 根据启用状态构建知识索引。
- 查询构建记录。
- 查询路引对话记录。

### 4.2 重构构建脚本

修改：

- `scripts/build-knowledge.ts`

目标：

- 只保留 CLI 入口。
- 核心构建逻辑迁移到 `src/modules/knowledge/hermit-builder.ts`。
- CLI 和管理端 API 使用同一套构建逻辑。

建议导出函数：

```ts
type HermitKnowledgeBuildInput = {
  sourceKeys?: string[];
  indexPath?: string;
  requireDatabase?: boolean;
};

type HermitKnowledgeBuildResult = {
  documentCount: number;
  chunkCount: number;
  indexPath: string;
  model: string;
  dimension: number;
};

export async function buildHermitKnowledgeIndex(input: HermitKnowledgeBuildInput): Promise<HermitKnowledgeBuildResult>;
```

### 4.3 API 设计

新增 API：

- `GET /api/admin/hermit-knowledge`
- `POST /api/admin/hermit-knowledge/selections`
- `POST /api/admin/hermit-knowledge/build`
- `GET /api/admin/hermit-knowledge/chats`
- `GET /api/admin/hermit-knowledge/chats/[sessionId]`

所有 API 都必须：

- 复用 `requireAdminPortal()`。
- 数据库相关操作前检查 `DATABASE_URL`。
- 返回统一 `{ data }` 或 `{ error }`。

#### `GET /api/admin/hermit-knowledge`

返回：

```ts
type AdminHermitKnowledgeOverview = {
  channels: Array<{
    key: "heart" | "mirror" | "action" | "workshop" | "norm";
    label: string;
    enabled: boolean;
    activeItemCount: number;
    totalItemCount: number;
    status: "active" | "disabled" | "future";
  }>;
  sources: Array<{
    sourceKey: string;
    title: string;
    channel: string;
    sourceKind: "static_file" | "content_item";
    enabled: boolean;
    published: boolean;
    updatedAt: string | null;
  }>;
  latestBuildRun: {
    id: string;
    status: "running" | "succeeded" | "failed";
    documentCount: number | null;
    chunkCount: number | null;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
  } | null;
};
```

#### `POST /api/admin/hermit-knowledge/selections`

请求：

```ts
type SaveHermitKnowledgeSelectionsRequest = {
  enabledSourceKeys: string[];
};
```

行为：

- 保存渠道和具体来源启用状态。
- 不触发构建。

#### `POST /api/admin/hermit-knowledge/build`

请求：

```ts
type BuildHermitKnowledgeRequest = {
  enabledSourceKeys: string[];
};
```

行为：

- 先保存勾选状态。
- 创建 `HermitKnowledgeBuildRun`。
- 调用 `buildHermitKnowledgeIndex`。
- 成功后更新构建记录。
- 失败后保留上一次可用索引，并记录错误。

#### `GET /api/admin/hermit-knowledge/chats`

返回会话列表：

```ts
type HermitChatSessionListItem = {
  id: string;
  title: string | null;
  messageCount: number;
  latestMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

#### `GET /api/admin/hermit-knowledge/chats/[sessionId]`

返回会话详情：

```ts
type HermitChatSessionDetail = {
  id: string;
  title: string | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    modelName: string | null;
    createdAt: string;
    retrievalTraces: Array<{
      query: string;
      contextText: string;
      topK: number;
      sourceSnapshot: unknown;
      createdAt: string;
    }>;
  }>;
};
```

## 5. 前端设计

### 5.1 新增页面

新增文件：

- `src/app/admin/hermit-knowledge/page.tsx`
- `src/app/admin/hermit-knowledge/AdminHermitKnowledgeClient.tsx`

修改：

- `src/app/admin/AdminHome.tsx`

页面结构：

- 顶部返回后台按钮。
- Hero：`路引知识库`
- 概览卡片：当前启用渠道、启用文件数、最近构建状态。
- Tab 或分区：
  - `知识源管理`
  - `对话记录`

### 5.2 知识源管理 UI

建议布局：

- 左侧渠道卡片：本心、镜鉴、笃行、共创、规范文件。
- 右侧来源表格：具体文件 / 案例。
- 每行有 checkbox。
- 顶部有全选当前渠道、只看已启用、只看未启用。
- 底部固定操作区：
  - `保存选择`
  - `保存并构建`

交互规则：

- 关闭渠道后，该渠道下具体文件置灰。
- 单个文件可以独立勾选 / 取消。
- 保存成功后展示提示。
- 构建失败后展示错误，但不要把页面状态误标为已生效。

### 5.3 对话记录 UI

建议布局：

- 左侧会话列表。
- 右侧消息详情。
- assistant 消息下方显示检索记录折叠区。
- 检索记录展示：
  - query。
  - topK。
  - source snapshot。
  - context 摘要。

v1 不做复杂搜索，先按时间倒序分页。

## 6. 实施任务

### Task 0：确认计划和路由命名

**文件：**

- 修改：`docs/plans/2026-06-15-admin-hermit-knowledge-management-plan.md`

**步骤：**

1. 确认页面路径是否使用 `/admin/hermit-knowledge`。
2. 确认 v1 构建是否先做同步构建。
3. 确认 Workshop / SOP 渠道是否在页面置灰展示。

**通过标准：**

- 用户确认可以进入实现。

### Task 1：新增 Prisma 模型和迁移

**文件：**

- 修改：`prisma/schema.prisma`
- 新建：`prisma/migrations/<timestamp>_add_hermit_knowledge_admin/migration.sql`

**步骤：**

1. 新增 `HermitKnowledgeSourceKind`。
2. 新增 `HermitKnowledgeChannel`。
3. 新增 `HermitKnowledgeBuildStatus`。
4. 新增 `HermitKnowledgeSourceConfig`。
5. 新增 `HermitKnowledgeBuildRun`。
6. 运行 Prisma generate。

**建议命令：**

```bash
npm run db:generate
```

**通过标准：**

- Prisma schema 可生成。

### Task 2：实现知识源枚举和勾选配置服务

**文件：**

- 新建：`src/modules/knowledge/hermit-admin.ts`
- 新建：`src/modules/knowledge/hermit-admin.test.ts`
- 修改：`src/modules/knowledge/index.ts`

**步骤：**

1. 写测试：能列出本心、镜鉴、笃行三个启用渠道。
2. 写测试：能列出静态文件和已发布 Action 案例。
3. 写测试：未发布内容不出现在可构建来源中。
4. 写测试：保存 enabledSourceKeys 后再次读取能保持状态。
5. 实现服务和 repository。

**建议命令：**

```bash
npm test -- src/modules/knowledge/hermit-admin.test.ts
```

**通过标准：**

- 知识源枚举和保存逻辑测试通过。

### Task 3：抽取可复用知识构建服务

**文件：**

- 新建或修改：`src/modules/knowledge/hermit-builder.ts`
- 新建或修改：`src/modules/knowledge/hermit-builder.test.ts`
- 修改：`scripts/build-knowledge.ts`
- 参考：`src/lib/hermit/knowledge-builder.ts`

**步骤：**

1. 写测试：只构建 enabled 的来源。
2. 写测试：渠道禁用时，其下来源不参与构建。
3. 写测试：构建失败不会覆盖旧索引文件。
4. 实现 `buildHermitKnowledgeIndex`。
5. 将 `scripts/build-knowledge.ts` 改为调用该函数。

**建议命令：**

```bash
npm test -- src/modules/knowledge/hermit-builder.test.ts
```

**通过标准：**

- CLI 和 API 共用同一套构建逻辑。
- 索引写入采用临时文件 + 原子替换，避免失败时破坏旧索引。

### Task 4：实现管理端 API

**文件：**

- 新建：`src/app/api/admin/hermit-knowledge/route.ts`
- 新建：`src/app/api/admin/hermit-knowledge/selections/route.ts`
- 新建：`src/app/api/admin/hermit-knowledge/build/route.ts`
- 新建：`src/app/api/admin/hermit-knowledge/chats/route.ts`
- 新建：`src/app/api/admin/hermit-knowledge/chats/[sessionId]/route.ts`

**步骤：**

1. 所有 API 接入 `requireAdminPortal()`。
2. `GET overview` 返回渠道、来源、最近构建。
3. `POST selections` 保存勾选状态。
4. `POST build` 保存并构建。
5. `GET chats` 返回会话列表。
6. `GET chat detail` 返回消息和检索 trace。

**通过标准：**

- 未登录访问返回 403。
- 登录后能读取和保存知识源配置。
- 构建失败返回可读错误。
- 对话记录能从持久化表读取。

### Task 5：实现管理员页面

**文件：**

- 新建：`src/app/admin/hermit-knowledge/page.tsx`
- 新建：`src/app/admin/hermit-knowledge/AdminHermitKnowledgeClient.tsx`
- 修改：`src/app/admin/AdminHome.tsx`
- 可能修改：`src/components/ui/lighthouse-icons.ts`

**步骤：**

1. 在后台首页增加 `路引知识库` 入口。
2. 新增页面鉴权，未登录展示 `AdminLoginClient`。
3. 页面加载 overview。
4. 实现渠道卡片。
5. 实现来源表格和 checkbox。
6. 实现 `保存选择`。
7. 实现 `保存并构建`。
8. 实现对话记录列表。
9. 实现会话详情和 retrieval trace 展示。

**通过标准：**

- 管理员能完成勾选、保存、构建。
- 管理员能查看所有对话持久化记录。
- 页面状态不会把“保存成功”误写成“构建成功”。

### Task 6：更新部署文档

**文件：**

- 修改：`.env.example`
- 修改：`docs/deployment/lighthouse-phase1-runtime-assumptions.md`

**步骤：**

1. 增加 `HERMIT_KNOWLEDGE_INDEX_PATH`。
2. 说明管理端构建需要 embedding 接入。
3. 说明生产环境要准备可写索引路径，或接入内部向量服务。
4. 说明 v1 管理页只控制 Heart / Mirror / Action。

**通过标准：**

- 部署文档不承诺未确认的 embedding 接入方式。

### Task 7：验证

**建议命令：**

```bash
npm test -- src/modules/knowledge/hermit-admin.test.ts src/modules/knowledge/hermit-builder.test.ts src/modules/hermit/service.test.ts
npm test
npx tsc --noEmit
npm run lint
git diff --check
```

`npm run build` 只有在 embedding 环境变量和索引写入路径确认后再跑。否则失败可能是环境问题，不一定是代码问题。

## 7. 风险和处理

### 7.1 后台构建耗时

风险：

- embedding 请求慢，页面等待时间长。

v1 处理：

- 先同步构建。
- 明确 loading 和失败提示。

后续处理：

- 引入构建队列、轮询和取消构建。

### 7.2 生产文件系统不可写

风险：

- Next standalone / 容器环境中，默认源码目录可能不可写。

v1 处理：

- 新增 `HERMIT_KNOWLEDGE_INDEX_PATH`。
- 部署文档要求配置到可写目录。

后续处理：

- 接入公司内部向量服务或对象存储。

### 7.3 勾选状态和构建结果混淆

风险：

- 管理员保存勾选后，以为路引已经使用了新知识。

v1 处理：

- 页面区分 `已保存` 和 `最近构建成功`。
- 构建失败不更新生效状态描述。

### 7.4 对话记录敏感性

风险：

- 对话可能包含门店、客户或内部处理细节。

v1 处理：

- 只在管理员后台展示。
- 不提供公开链接。
- 后续如有真实客户信息，需要增加脱敏和权限分级。

## 8. 完成标准

- [ ] 后台首页有 `路引知识库` 入口。
- [ ] 管理页展示本心、镜鉴、笃行渠道。
- [ ] 管理页能展示渠道下具体文件 / 具体已发布案例。
- [ ] 管理员能勾选启用来源并保存。
- [ ] 管理员能点击 `保存并构建` 触发知识重建。
- [ ] 构建运行有成功 / 失败记录。
- [ ] 构建失败不破坏旧索引。
- [ ] 管理页能查看所有路引对话会话。
- [ ] 管理页能查看每条会话的消息和检索 trace。
- [ ] 未登录管理员不能访问 API 和页面。
- [ ] 部署文档说明 embedding 和索引写入路径要求。
- [ ] 测试、类型检查、lint 和 diff check 通过，或环境阻塞被明确记录。

## 9. 决策记录

| 日期 | 决策 | 状态 |
|---|---|---|
| 2026-06-15 | 新增管理员路引知识库页面。 | 已提出 |
| 2026-06-15 | 管理页同时管理知识源和查看对话持久化记录。 | 已提出 |
| 2026-06-15 | 知识源启用配置和构建产物分开存储。 | 建议 |
| 2026-06-15 | v1 先做同步构建，后续再升级后台队列。 | 建议 |
| 2026-06-15 | 对话记录复用现有 `ChatSession` / `ChatMessage` / `RetrievalTrace`。 | 建议 |

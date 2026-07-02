# 路引 RAG 知识源治理实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标：**先把路引 v1 的知识源边界、维护方式、回答策略和部署前置条件确定下来，再开展代码实现，避免直接把过宽的知识源接入检索。

**架构思路：**v1 只纳入已发布内容，知识源先收窄到 Heart / Mirror 理念材料和 Action 已发布案例。知识维护长期以管理端发布版本为主，静态 Markdown 作为初始化种子、历史参考和兜底材料。RAG 检索不直接追求“找最像的片段”，而是服务于回答策略：当直接依据不足时，提供底层逻辑相近的案例参考，并结合服务文化框架给出建议。

**技术栈：**Next.js App Router、TypeScript、Prisma / MySQL、Vitest、OpenAI-compatible chat 模型、待确认的公司内部 embedding 接入方式、当前阶段的本地 JSON 向量索引。

---

## 1. 本轮沟通后已确认的口径

### 1.1 v1 知识源范围

v1 只纳入已发布内容。

本阶段纳入：

- Heart / Mirror 理念材料。
- Action 已发布案例。

本阶段不纳入：

- Workshop 已发布 Do / Don't 指南。
- SOP / 规范文件。
- 管理端中未发布的草稿、待审核、驳回、归档内容。
- 任何需要现场确认但尚未沉淀为已发布内容的材料。

说明：

- Workshop 和 SOP 以后可以进入路引知识库，但不放进本次 v1 主范围。
- 这样做可以先把路引从“理念解释 + 案例参考”跑稳，再逐步引入更高权威等级的规范类内容。

### 1.2 证据权威等级

暂不最终确定。

当前只做最低限度区分：

- Heart / Mirror 理念材料：用于解释原则、建立判断框架。
- Action 已发布案例：用于提供底层逻辑相近的参考案例，不直接当成制度或规范。

后续再单独确认：

- Action 案例什么时候可以作为强参考。
- Workshop Do / Don't 进入后是否高于 Action 案例。
- SOP / 规范文件进入后是否作为最高权威依据。
- 回答中是否需要显式展示“依据等级”。

### 1.3 知识源维护方式

长期方向：

- 管理端发布版本为主。
- 静态 Markdown 仍然保留参考价值。
- 长期不要靠改代码文件维护路引知识。

v1 落地方式：

- 构建知识库时优先读取管理端已发布版本。
- 静态 Markdown 用作初始化种子、兜底材料和对照参考。
- 如果同一内容既有静态版本又有管理端发布版本，应优先使用管理端发布版本。
- 草稿和未发布版本不得进入路引检索。

### 1.4 回答策略

当直接证据不足时，路引不要生硬地说“证据不足”。

更合适的策略是：

- 找到底层逻辑相近的 Action 案例给用户参考。
- 结合 Heart / Mirror 的服务文化框架给出建议。
- 明确这是“相近案例参考”或“基于相同服务逻辑的建议”，不要包装成制度结论。
- 不强行引用牵强材料。
- 不替代现场主管、门店管理或公司正式规范的最终判断。

建议回答结构：

1. 先给一个可执行的方向。
2. 再说明背后的服务逻辑。
3. 再给相近 Action 案例的参考点。
4. 最后给一线可尝试的话术、动作或检查清单。

### 1.5 embedding 部署

公司有模型，但 embedding 如何接入还需要确认。

计划中的技术要求：

- 不在代码里绑定某个固定供应商。
- 支持公司内部 embedding endpoint 或内部向量检索服务。
- chat 模型和 embedding 模型分开确认。
- 如果只有 chat 模型、没有 embedding 或向量检索能力，则不能宣称 RAG 已完整启用。
- 部署文档要明确：路引检索能力需要 embedding 或等价向量检索能力支撑。

### 1.6 验收方式

待定。

计划先保留验收框架，但不替用户提前定死标准。

## 2. 本次要解决的问题

### 2.1 知识源覆盖问题

当前风险：

- 路引主要依赖少量静态知识材料。
- 更像“理念解释助手”，还不够像“能结合内部实践给一线建议的助手”。

v1 处理方式：

- 先不扩大到所有内部材料。
- 先把 Heart / Mirror 理念材料和 Action 已发布案例整理成稳定、可追踪、可更新的知识源。
- 让路引能够基于理念和案例给出实践建议。

### 2.2 检索收敛问题

当前风险：

- 如果只是 topK 检索，系统总能找到“最像”的几段。
- 这些片段可能只是表面相似，实际并不能支撑回答。

v1 处理方式：

- 检索结果必须带来源类型。
- Action 案例默认按“相近案例参考”使用。
- Heart / Mirror 默认按“原则框架”使用。
- 如果没有直接匹配，就转为“相近案例 + 框架建议”，而不是伪装成确定依据。

## 3. 数据设计口径

### 3.1 知识源类型

v1 需要支持两个核心类型：

```ts
type HermitKnowledgeSourceType =
  | "heart_mirror_principle"
  | "action_case";
```

后续预留但不启用：

```ts
type FutureHermitKnowledgeSourceType =
  | "workshop_guide"
  | "norm_file"
  | "sop"
  | "training";
```

### 3.2 知识片段元数据

每个进入向量索引的片段至少需要：

```ts
type HermitKnowledgeChunkMetadata = {
  id: string;
  sourceId: string;
  sourceType: "heart_mirror_principle" | "action_case";
  title: string;
  status: "published";
  sourceUrl?: string;
  role?: string;
  scenario?: string;
  tags?: string[];
  updatedAt?: string;
};
```

设计原则：

- 不只保存纯文本。
- 必须能追溯来源。
- 必须能区分理念材料和案例材料。
- 必须能过滤非发布内容。

### 3.3 静态 Markdown 和管理端内容的关系

短期：

- 静态 Markdown 可以参与构建。
- Action 静态案例可以作为已发布案例的种子来源。

长期：

- 管理端发布版本优先。
- 静态 Markdown 作为参考，不作为主要维护入口。
- 如果内容已经在管理端发布，则知识库构建应优先使用管理端发布版本。

## 4. 实施阶段

### 阶段 0：确认计划

**文件：**

- 修改：`docs/plans/2026-06-15-hermit-rag-knowledge-coverage-plan.md`

**要确认：**

- v1 是否只做 Heart / Mirror + Action 已发布案例。
- 证据权威等级是否继续标记为待定。
- embedding 接入是否先写成部署待确认项。
- 验收方式是否先保留框架，不写死问题集。

**通过标准：**

- 用户确认本计划方向可以进入实现。

### 阶段 1：整理知识源构建规则

**文件：**

- 新建或修改：`src/lib/hermit/knowledge-builder.ts`
- 新建或修改：`src/lib/hermit/knowledge-builder.test.ts`
- 修改：`scripts/build-knowledge.ts`

**目标：**

- 把 Heart / Mirror 理念材料整理为 `heart_mirror_principle`。
- 把 Action 已发布案例整理为 `action_case`。
- 排除未发布内容。
- 保留来源、标题、标签、场景等元数据。

**测试重点：**

- 已发布 Action 案例会进入知识构建。
- 草稿 Action 案例不会进入知识构建。
- Heart / Mirror 静态材料能进入知识构建。
- 管理端发布版本优先于静态版本。

**建议命令：**

```bash
npm test -- src/lib/hermit/knowledge-builder.test.ts
```

### 阶段 2：调整构建脚本

**文件：**

- 修改：`scripts/build-knowledge.ts`
- 可能修改：`.env.example`
- 可能修改：`docs/deployment/lighthouse-phase1-runtime-assumptions.md`

**目标：**

- 构建时读取 v1 允许的知识源。
- 如果数据库可用，读取管理端已发布 Action 内容。
- 如果数据库不可用，允许使用静态 Markdown 和静态 Action 种子作为开发兜底。
- 不把 Workshop、SOP、规范文件接入 v1 索引。

**部署配置建议：**

```env
HERMIT_KNOWLEDGE_REQUIRE_DATABASE="false"
```

说明：

- 开发和演示环境可以允许静态兜底。
- 生产环境是否强制依赖数据库，等部署方式确认后再决定。

### 阶段 3：调整检索与回答上下文

**文件：**

- 修改：`src/lib/hermit/rag.ts`
- 修改：`src/lib/hermit/rag.test.ts`
- 可能修改：`src/lib/hermit/system-prompt.ts`

**目标：**

- 检索结果区分“原则框架”和“相近案例”。
- Action 案例默认作为参考案例，不写成制度依据。
- Heart / Mirror 用来组织判断框架。
- 没有直接匹配时，回答仍然给相近案例和框架建议，但不要声称有明确内部依据。

**建议的上下文格式：**

```text
## 路引可参考材料

### 服务理念 / 判断框架
- 来源：Heart / Mirror
- 要点：...

### 相近 Action 案例
- 案例：...
- 相近点：...
- 可借鉴动作：...
```

**测试重点：**

- Action 案例不会被格式化成 SOP。
- Heart / Mirror 不会被格式化成案例。
- 检索不到强相关内容时，仍可返回框架建议和相近案例。
- 明显无关问题不强行塞入案例。

**建议命令：**

```bash
npm test -- src/lib/hermit/rag.test.ts
```

### 阶段 4：接入聊天链路与追踪

**文件：**

- 修改：`src/app/api/chat/route.ts`
- 修改：`src/modules/hermit/service.ts`
- 修改：`src/modules/hermit/service.test.ts`

**目标：**

- 聊天时使用新的检索结果结构。
- 保存本次回答参考了哪些理念材料和哪些 Action 案例。
- 后续能排查某个回答为什么引用某个案例。

**追踪信息建议：**

```ts
type HermitRetrievalSourceSnapshot = {
  sourceType: "heart_mirror_principle" | "action_case";
  title: string;
  sourceId: string;
  score?: number;
  reason?: string;
};
```

**测试重点：**

- 检索 source snapshot 能被持久化。
- 没有检索结果时，聊天仍可继续。
- RAG 失败不影响基本对话链路。

### 阶段 5：部署文档更新

**文件：**

- 修改：`.env.example`
- 修改：`docs/deployment/lighthouse-phase1-runtime-assumptions.md`

**目标：**

- 明确 chat 模型和 embedding 模型是两类能力。
- 公司模型已有，但 embedding 接入方式待确认。
- 如果没有 embedding 或向量检索服务，不能把 RAG 能力作为已完成部署能力。
- 说明 v1 知识源范围只包含 Heart / Mirror 和 Action 已发布案例。

**建议写法：**

```text
路引 v1 检索知识源只纳入已发布内容，当前包括 Heart / Mirror 理念材料和 Action 已发布案例。
Workshop Do / Don't、SOP、规范文件暂不进入 v1 检索范围，后续在证据权威等级确认后再接入。
```

## 5. 待确认事项

### 5.1 证据权威等级

待确认问题：

- Action 案例是否永远只作为参考案例。
- 什么时候可以说“有明确依据”。
- 如果后续接入 SOP / 规范文件，是否作为最高权威。
- 用户界面是否需要展示依据等级。

### 5.2 embedding 接入方式

待确认问题：

- 公司内部 embedding endpoint 的地址格式。
- 鉴权方式。
- 模型名称。
- 向量维度。
- 是否和 chat 模型走同一个网关。
- 是否支持批量 embedding。
- 部署时是否能同时在构建期和运行期访问。

### 5.3 验收方式

待确认问题：

- 是否按一线服务场景准备问题集。
- 是否要求每个回答展示参考案例。
- 是否要求回答中显示来源。
- 是否要评估“回答是否过度确定”。
- 是否要人工评审输出质量。

## 6. 当前不建议立刻做的事

- 不建议把 Workshop Do / Don't 直接接入 v1。
- 不建议把 SOP / 规范文件提前接入，除非证据等级已经定好。
- 不建议把所有静态文档都塞进向量库。
- 不建议在 embedding 接入方式未确认前承诺生产 RAG 完整可用。
- 不建议让路引在没有强依据时说“根据内部规范”。

## 7. 验证计划

代码实施后再执行：

```bash
npm test -- src/lib/hermit/knowledge-builder.test.ts src/lib/hermit/rag.test.ts src/modules/hermit/service.test.ts
npm test
npx tsc --noEmit
npm run lint
git diff --check
```

`npm run build` 需要等 embedding 环境变量和内部模型接入方式确认后再跑。否则失败可能是环境问题，不一定是代码问题。

## 8. 完成标准

- [ ] 用户确认本中文计划。
- [ ] v1 知识源只包含已发布 Heart / Mirror 和 Action 案例。
- [ ] 未发布内容不会进入知识库。
- [ ] 管理端发布版本优先于静态 Markdown。
- [ ] 静态 Markdown 保留为参考和兜底。
- [ ] Action 案例按相近案例参考使用，不当作规范。
- [ ] 回答在直接依据不足时，采用相近案例 + 框架建议。
- [ ] 部署文档说明 embedding 接入待确认。
- [ ] 验收方式保留待定，不提前写死。

## 9. 决策记录

| 日期 | 决策 | 状态 |
|---|---|---|
| 2026-06-15 | v1 只纳入已发布内容。 | 已确认 |
| 2026-06-15 | v1 知识源包括 Heart / Mirror 理念材料和 Action 已发布案例。 | 已确认 |
| 2026-06-15 | 证据权威等级晚点确定。 | 待确认 |
| 2026-06-15 | 后续以管理端发布版本为主，静态 Markdown 仍需参考。 | 已确认 |
| 2026-06-15 | 长期不要靠改代码文件维护路引知识。 | 已确认 |
| 2026-06-15 | 直接证据不足时，不说“证据不足”，而是给底层逻辑相近案例并结合框架建议。 | 已确认 |
| 2026-06-15 | 公司有模型，但 embedding 如何接入需要确认。 | 待确认 |
| 2026-06-15 | 验收方式待定。 | 待确认 |
| 2026-07-02 | `一般参悟案例-格式统一版` 已作为最终确认内容源归档到 `docs/content/action-canwu-cases/2026-06-final/`；在完成 Action 导入/发布前，不视为已发布检索内容。 | 已记录 |

# AGENTS.md

## Lighthouse Requirement Intake Rule

When the user mentions any new optimization, feature, bug, product idea, UI change,
content change, admin request, deployment concern, or technical debt for this
project, treat it as a requirement intake first.

Do not jump directly into implementation unless the user explicitly says to start
development or points to an existing Linear issue that is already ready for
development.

Default flow:

1. Understand the request.
   - Restate the user goal in concrete product terms.
   - Identify the affected module: Heart, Mirror, Action, Workshop, Hermit, Admin,
     Deployment, Data, Design, Content, AI / Knowledge, or Tech Debt.
   - Identify whether the request is an optimization, feature, bug, content task,
     technical debt, deployment task, or decision item.

2. Judge readiness.
   - Decide whether the request belongs in Backlog, Needs Definition, Todo, or is
     out of v1 scope.
   - If the requirement is vague, ask focused follow-up questions or mark it as
     Needs Definition.
   - If the request has accessibility, data, content-source, knowledge-source, or
     deployment implications, call those out before creating implementation work.

3. Deepen the requirement before coding.
   Capture or draft:
   - background
   - current problem
   - target outcome
   - scope
   - explicit non-goals
   - affected modules, pages, files, data, content sources, or knowledge sources
   - acceptance criteria
   - risks and dependencies
   - recommended milestone, labels, priority, and state

4. Submit to Linear before development.
   - Use Linear team: `Keith Lim`.
   - Use Linear project: `Lighthouse`.
   - Search for duplicate issues before creating a new one.
   - New unconfirmed requirements should normally be created in `Backlog`.
   - Add `Needs Definition` when the requirement still has open product,
     accessibility, data, knowledge, or acceptance questions.
   - After creating or updating the Linear issue, report the issue ID and URL to
     the user.

5. Ask before entering development.
   After the requirement has been understood, structured, and recorded in Linear,
   ask the user whether to move into development.

   Use this decision point unless the user explicitly said to implement now:
   "这个需求已经进入 Linear。要不要现在进入开发？"

6. Development flow for an existing Linear issue.
   If the user asks to implement an existing issue:
   - Read the Linear issue first.
   - Read the Lighthouse lifecycle document if available.
   - Confirm the requirement is sufficiently defined.
   - Move the issue to `In Progress` only when implementation starts.
   - Keep scope tightly aligned to the issue.
   - Run appropriate verification.
   - Update the Linear issue with verification results before calling it done.

## Linear Defaults

Project:
- `Lighthouse`

Team:
- `Keith Lim`

Useful milestones:
- `v1 范围治理`
- `Workshop 生产化`
- `Action 内容闭环`
- `Hermit 知识治理`
- `部署与验收硬化`

Useful labels:
- `Product`
- `Content`
- `Admin`
- `AI / Knowledge`
- `Tech Debt`
- `Deployment`
- `Design`
- `Later`
- `Needs Definition`
- `Feature`
- `Improvement`
- `Bug`

Priority guidance:
- Urgent: release blocker, data loss, severe regression, or core flow unavailable.
- High: required for v1 or blocks another mainline task.
- Medium: important for v1 but not blocking.
- Low: polish, follow-up improvement, or non-critical cleanup.

## Issue Templates

Feature or optimization issue:

```markdown
## 背景

## 当前问题

## 目标结果

## 范围

## 不做

## 涉及模块 / 文件 / 页面

## 验收标准

## 风险 / 依赖

## 验证记录
```

Bug issue:

```markdown
## 现象

## 影响

## 复现方式

## 期望行为

## 修复范围

## 验证记录
```

Technical debt issue:

```markdown
## 背景

## 当前风险

## 目标状态

## 改动范围

## 不做

## 验收标准

## 验证记录
```

## Module-Specific Guardrails

Action / 笃行:
- Content changes must keep source Markdown, manifests, generated data, route
  mappings, tests, and archive metadata synchronized.
- Do not only hide content in the UI when the user asks for deletion or removal.

Hermit / 路引:
- Treat Hermit as a domain assistant for automotive after-sales service culture,
  not as a generic chatbot.
- For focus, keyboard, input, and suggestion-list changes, preserve usable
  keyboard navigation and a visible `:focus-visible` or equivalent state.
- Do not weaken RAG, prompt, knowledge-source, or chat behavior as part of a UI
  polish task unless the issue explicitly asks for it.

Workshop / 共创:
- Keep v1 centered on role-specific Do & Don't guidance, not a broad forum.
- Preserve the simple brand-side highest-admin review model unless the user
  explicitly reopens role design.

Deployment:
- Before calling a development task ready to close, run the appropriate local
  gate for the touched scope.
- For broad or release-bound changes, prefer the full gate:
  `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npx next build`.

## User Communication

When the user gives a new requirement, reply with:

1. requirement understanding
2. classification
3. suggested Linear state, labels, milestone, and priority
4. any open questions
5. whether a Linear issue was created or should be created
6. a direct question asking whether to enter development

Keep the response in Chinese unless the user asks otherwise.

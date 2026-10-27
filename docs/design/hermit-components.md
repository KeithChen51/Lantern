# 路引标准组件

当前契约：2026-10-27，关联 [Issue #86](https://github.com/KeithChen51/Lantern/issues/86)。产品边界见 [路引权威定义](hermit-authoritative-definition.md)。

## 组件与源码映射

| 组件 | Figma 主组件 | 源码 | 关键契约 |
| --- | --- | --- | --- |
| 输入区 | [Composer 177:17](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=177-17) | `src/components/hermit/ChatInput.tsx` | 共享首屏与会话输入；受控草稿；生成期间可编辑；发送与停止互换 |
| 添加内容 | [添加菜单与资源组件 249:1123](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=249-1123) | `AddContentMenu.tsx` / `context-resources.ts` | 悬浮提示；本地文件、知识文件、平台 Skill；原生 popover；搜索、分页、空态、重试与过期请求隔离 |
| 快捷提示词 | [ScenarioCard 179:24](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=179-24) | `ScenarioCards.tsx` | 普通按钮，仅填入草稿并聚焦；无模式、持久选中态或自动发送 |
| 发送前附件 | [AttachmentTile 212:1102](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=212-1102) | `AttachmentContext.tsx` | Ready / Uploading / Error；输入框上方左对齐、横排换行；移除、取消与重试 |
| 会话栏 | [ConversationHeader 179:50](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=179-50) | `ConversationHeader.tsx` | 新对话与历史；起步页只显示操作，会话页增加身份与截断标题 |
| 历史行与抽屉 | [HistoryRow 181:331](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=181-331) | `ConversationHistory.tsx` | 标题、摘要、时间；账号内分页、加载、空态、失败、恢复；原生 dialog 支持 Escape 与焦点返回 |
| 执行反馈 | [生成 / 失败 / 停止示例](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=183-562) | `RunFeedback.tsx` | 只展示真实事件；错误在对应回答位置；重试保留下一条草稿 |
| 路引身份 | [Identity 118:811](https://www.figma.com/design/pTRlWu7oWNW7LqLCFr9262?node-id=118-811) | 上述组件复用本地 `lighthouseIcons` | 琥珀图标贯穿起步、会话与回答，不重建全局导航 |

源码路径均位于 `src/components/hermit/`。编排由 `ChatPanel.tsx` 负责，状态恢复在 `conversation-state.ts`，上传生命周期在 `useHermitAttachments.ts`；请求契约统一使用 `src/lib/hermit/conversation-contract.ts`。现有 `MessageBubble` 与 `DocReader` 继续负责消息、来源与页内阅读。

## 输入与上下文

- 首屏最大宽度 800 px；输入区 18 px 圆角、V3 暖白表面与浅色边界。聚焦时保持同一边界与默认轻阴影，不增加橙色描边、光晕或文本内框。光标指示文本焦点；按钮、链接、快捷卡保留可见键盘焦点。
- Enter 发送，Shift+Enter 换行，中文输入法组词期间不发送。生成期间可写下一条草稿，发送按钮切换为停止。
- 发送使用本地 Solar `arrow-up-linear` 图标，24×24、1.5 px 线宽；不使用字体箭头。停止保持方形符号。
- 输入底部左侧只显示加号，悬浮提示“添加文件和更多内容”；浮层包含本地文件、灯塔知识文件、使用技能。上传限制收进浮层说明：PDF、DOCX、TXT、Markdown，单文件 10 MB、会话最多 5 个，限制以后端为准。
- 知识文件选择器查询当前站点可访问的文档、案例、通知；技能选择器只查询平台已发布 Skill，不读取服务器或用户个人技能目录。支持搜索、分页、加载失败与重试；搜索回车不发送草稿，Escape 关闭并返回焦点。
- 文档与技能各选一项，可以和本地附件同时使用。选择后聚焦输入框；重新选择同类内容替换旧选择，移除不影响其他内容。
- `AttachmentContext` 的 `pending` 变体显示未发送文件卡，`context` 变体显示已参与会话的文件、当前引用文档和技能。移除上下文不改草稿，也不删除已经发送的历史文字；重试不会重新带入已移除的上下文。
- 卡片宽度随可用空间收缩；文件名省略但保留完整可访问名称，状态与按钮不能被挤掉。上传中取消必须中断关联任务，失败文件不能随消息发送。

## 会话与执行

- `ChatPanel` 按当前身份和会话建立独立状态。新建、恢复或身份变化时，取消旧异步工作，忽略过期回包，避免串入另一对话。
- 历史接口仅接受服务端当前身份。恢复附件先重新检查所有权、状态与有效期；失效附件显示提示。旧记录缺少来源数据时只显示文本，不推断引用。
- `skillContext` 与 `documentContext` 独立携带资源 ID 和版本 ID；服务器校验类型、发布、权限及有效期，恢复历史时再次检查。Skill 仅提供方法指导，正文和参考文件仍须实际读取，不执行脚本、不导出文件，也不自动生成引用。不可用技能显示提示并移出活动上下文。
- `data-hermit-progress` 对应 connecting / searching / reading / answering；实际工具调用和文本流驱动，不使用模拟计时器。
- 终态为 complete / failed / cancelled，写入服务端可信消息元数据。客户端传入的来源与终态不能替代服务端记录。
- 失败原位重试、不重复用户消息、不把旧问题覆盖到草稿；停止保留部分回答与草稿。

## 布局与维护

固定顶部、消息与底部输入的容器关系，消息和文档独立滚动。窄屏快捷卡纵排、历史抽屉占满可用宽度；尊重 `prefers-reduced-motion`。本心首页、全局导航和其他页面不属于这次组件改造范围。

Figma 的 05 页顶部同步展示当前输入、附件和快捷卡实例；15 页集中维护主组件与路引状态，14 页维护全平台 V3。旧组件仅用于归档实例，替代关系见 [归档索引](archive/README.md) 与 [本次原型扫描](figma-component-audit-2026-10-27.md)。文件内组件复用已建立；不等同于发布团队 Library 或 Code Connect 自动映射。

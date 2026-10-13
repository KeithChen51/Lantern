# 知识读取与管理授权（Issue 48）

普通员工使用员工会话访问 `/api/resources`、资源详情、附件及下载。这里仅接受 Web 员工会话；工具 Bearer 不替代 Web 登录。管理员 `/api/admin/knowledge` 列表、预览及下载额外要求 `knowledge:manage`。写入和上传调用 `requireKnowledgeAdmin(request, {write:true})`，由认证层确认 60 秒内角色，并校验配置的同源 Origin 与 CSRF。没有共享管理密码或 `highest_admin` 继承。

管理员所有变更在同一存储事务内写入 HubAudit；`detail` JSON 包含 `actor:{userId,account,requestId}` 和原操作详情。一次上传的全部文件共用 requestId。审计写入失败时变更回滚。维护脚本使用 `actor:{channel:"operations"}`，不能被解释为员工操作。

## 外部客户端 HTTP

以下接口只接受有效的 `knowledge:read` Bearer，校验发生在参数解析及存储读取之前。所有成功与错误响应禁止缓存。查询参数严格校验，未知或重复参数拒绝。分页默认 20、最大 100；每个访问凭据每分钟最多 120 次请求。该限流只覆盖当前 Node 进程，部署多实例时需网关按凭据补充共享限流。

| GET 路径（前缀 `/api/client/v1/resources`） | 查询参数 | 响应 |
| --- | --- | --- |
| 根路径 | `query,type,tag,visibility,offset,limit` | `{query,items,total,offset,limit,hasMore}` |
| `/browse` | `folderId,offset,limit` | `{mode,folderId,path,folders,resources,total,offset,limit,hasMore}` |
| `/{id}` | `versionId` 可选 | 发布版元数据及 `resourceId,sectionsTotal,filesTotal` |
| `/{id}/outline` | `versionId` 必填，`sectionOffset,sectionLimit,fileOffset,fileLimit` | 元数据及分段 `sections,files`、各页 offset/limit/total/hasMore |
| `/{id}/read` | `versionId` 必填，`offset` 或 `startLine`，`lineCount` | 元数据、相关 sections、`markdown,offset,startLine,endLine,nextOffset,nextLine,truncated` |
| `/{id}/files` | `versionId` 必填，`offset,limit` | `{resourceId,versionId,title,source,files,offset,limit,total,hasMore}` |
| `/{id}/files/read` | `versionId,path` 必填，`offset` | `{resourceId,versionId,title,source,path,mediaType,checksum,size,isText,offset,text,nextOffset,truncated}` |
| `/{id}/download` | `versionId,fileId` 必填 | 二进制文件；package 为完整资源 ZIP/Markdown，markdown 为主正文 |

元数据包含 `id,title,type,summary,source,tags,visibility,versionId,version,publishedAt,updatedAt,validity`；这里 `version` 是版本号。get 及 files 响应提供 `downloads:[{fileId,label,mediaType}]`，列出可下载的 package 与 markdown。不会返回全文、附件 base64、内部评分、草稿、变更说明或交互溯源。`summary` 最多 600 字符，source 最多 400 字符，tags 最多 20 个。目录与搜索返回同类元数据。sections 为 `{id,heading,startLine,endLine}`；files 为 `{fileId,path,mediaType,checksum,size,isText}`，fileId 为包内相对路径的 SHA-256（64 位小写十六进制），必须来自 files/outline 返回值，读取文本仍使用 path，size 为字节数。正文和文本文件每次最多 120 行、12000 字符，客户端按 nextOffset 或 nextLine 继续读取。二进制文件不通过 files/read 输出。下载用 `X-Resource-Version` 标记准确版本，附件始终以下载方式交付且 nosniff。

外部客户端不提供 ask、会话、写入、关系创建、交互上传或原始消息读取；Agent 推理属于调用方。已有 `npm run hub`、`hub:mcp` 是直接连接存储的运维工具，只能由运维账户在受控环境启动，不是员工客户端分发入口。

## 发布与归档边界

每次读取均重新检查资源未归档、仍有当前有效发布版。归档、撤销发布或当前发布失效同时阻断搜索、目录、详情、历史版本、预览、文件与下载。可明确读取当前资源的历史已发布版本；跨资源版本 ID 和草稿版本拒绝。管理员预览可明确读取草稿及归档资源，普通员工和外部客户端没有此例外。

HubVersion.metadata 保存导入时的元数据快照；元数据变化形成新草稿版本，不能覆盖已发布版本的标题、摘要、标签或来源。公开／内参分类为管理员可调整的资源状态；导入草稿不能提前改变已发布资源分类，发布时才应用新版本的分类。旧版本没有快照时仅保留该版本固有的 title，其余摘要、来源、标签与业务范围为空，旧案例按内参处理，避免读取曾被历史草稿污染的可变元数据。要恢复这些旧元数据，管理员应核对来源、导入并发布一个新版本；迁移不会猜测旧快照。

运行时读 API 不自动导入资料、初始化文件夹或写入种子。初始化仍为显式运维脚本。业务运行依赖启用的知识库；页面及 Hermit 的静态回退关闭由相应模块维护。

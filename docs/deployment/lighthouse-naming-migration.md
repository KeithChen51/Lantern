# lighthouse 命名兼容与数据迁移

源码、npm 包、DSH provider/plugin、Skill 维护目录及新部署示例统一使用 `lighthouse`。真实 GitHub 仓库/Issue 地址、相邻品牌工作区路径、旧交付产物名称和历史日志保留事实名称。

## SQLite 与持久卷

新默认为 `storage/knowledge/lighthouse.sqlite`，容器默认 `/data/knowledge/lighthouse.sqlite`。配置路径的文件名为 `lighthouse.sqlite` 时，若该文件不存在而同目录存在 `lantern.sqlite`，继续使用旧文件；不会新建空库替代旧资料。两者都存在时选择新文件并输出迁移歧义提示，不自动合并或覆盖。明确配置 `lantern.sqlite` 或其他自定义文件名仍严格使用配置路径。

升级时继续挂载既有持久卷（包括旧名称 `lantern-knowledge`），不要用新卷名替代旧卷。只改容器镜像标签不代表数据迁移完成。

需要改文件名时：停止所有知识服务和 CLI，确认实际使用路径，备份完整数据库及伴随 WAL/SHM 文件，使用 SQLite 官方 backup API 或 `.backup` 生成一致备份，再从备份建立 `lighthouse.sqlite`。重新启动后核对资源数量、版本、已发布正文及附件；保留原文件直到验收完成。不要在仍有进程写入时直接复制单个 SQLite 文件。回滚时停止所有进程并明确设置旧路径，不自动回退覆盖已写入的新文件。

## Skill 资源身份

唯一维护目录、Skill frontmatter、npm 包名及本机新入口是 `skills/lighthouse-knowledge-standardize` / `lighthouse-knowledge-standardize`。本机已安装的旧入口链接由维护者指向新目录；源码不会操作用户的全局 Skill 配置。

知识库内置资源 ID 和由 ID 生成的下载文件名继续是 `lantern-knowledge-standardize`。初始化依然按该固定 ID 检查并跳过已有资源，保留管理员维护的版本、资源关系和历史链接。已导入旧包不会被部署自动覆写；如需更新包名，通过正常资源版本管理显式发布新版本。

## 本地维护 MCP 与进程缓存

维护 MCP server 名称为 `lighthouse-knowledge`，工具使用 `lighthouse_*`，资源 URI 使用 `lighthouse://resources/{id}/versions/{versionId}`。原 `lantern_*` 与 `lantern://` 保留 deprecated 兼容别名，使用同一实现和错误语义。别名只保持现有本地维护接口，不能作为新增员工客户端的授权入口。

SQLite 全局缓存和路引附件 Symbol 键保留原键到同一对象的别名，避免开发热重载打开第二连接或丢失已有附件；这些键是进程内状态，不能跨进程共享。

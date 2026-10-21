# IAM 登录 + 中台角色：Bruno 与浏览器验收

适用于 `AUTH_MODE=iam`、`IAM_AUTHORIZATION_SOURCE=portal`。完整配置见[部署指引](../../../docs/deployment/lighthouse-iam-portal.md)。本目录是验收说明，复用现有只读集合，不是“运行整个集合即可通过”的自动化；不修改真实账号或授权。

## 复用只读集合

用 Bruno 打开 [iam-readonly](../iam-readonly/)，在本机选择/创建环境，`baseUrl` 填实际灯塔入口（本轮 `http://10.0.147.68:16888`），只单独执行：

1. [01 anonymous me](../iam-readonly/01-anonymous-me.bru)：清空 Bruno Cookie jar，无 Cookie 执行，应为 401，不能是 404、重定向或 HTML 登录页。
2. 在真实浏览器打开灯塔 `/auth/iam/start`，由 IAM 完成登录和回调。组合模式 Cookie 名含 `iam_portal_`，HTTP 测试名还含 origin 散列；必须从同一实际环境取值。将灯塔 `cookie-name=value` 仅保存为 Bruno 本机 secret `sessionCookie`。
3. [05 authenticated me](../iam-readonly/05-authenticated-me.bru)：手动执行，200 后在本机核对工号、组织与当前能力。姓名可能使用工号；不能把 IAM 没有返回姓名判成登录失败。再用不带 Cookie 的 01 确认匿名仍为 401。

**跳过 02–04 的同步目录请求**：它们只适用于 `IAM_AUTHORIZATION_SOURCE=sync`。组合模式不需要 `syncAppKey` / `syncAuthorization`；不能为跑绿目录测试补上假的同步密钥。

OAuth state 是与浏览器事务绑定的一次性值。不要在 Bruno 手拼 `/auth/iam/callback?code=...&state=...` 代替浏览器；不要从他人浏览器复制 state、重用 code 或用人工补参绕过绑定。浏览器退出、state 拒绝与回调重放要各自保留脱敏结论。

## 中台 role-query 的只读核验

仅在隔离模拟环境使用合成变量，或由运维在内网获准后对受控测试工号执行只读查询。不要在集合提交真实 account、appKey、secret、签名、Cookie 或响应资料；不自动授予/撤销真实角色。以下为请求结构说明，不包含真实凭据：

```text
POST {{portalApiBaseUrl}}/sso/admin/subapp/role-query
Content-Type: application/json
appKey: {{portalAppCode}}
timestamp: {{timestamp}}
sign: {{sign}}

{"account":"SYNTHETIC_EMPLOYEE_001"}

timestamp = 当前毫秒时间字符串
sign = hex(HMAC-SHA256(本机私有 portalAppSecret, account + "." + timestamp))
```

`portalAppSecret` 和生成的签名只放本机 secret；不发送 IAM token，不调用 `infoByToken`。不能使用 `IAM_CLIENT_SECRET` 代替 HMAC secret。中台 API 若为 HTTP，灯塔运行配置还须填精确 `PORTAL_API_HTTP_ORIGIN`；Bruno 能直接请求成功并不证明灯塔配置或容器网络正确。

在本机核对成功业务码 `000000`、同工号 `data.account`、同应用 `data.appCode` 和 `data.roles[].code`。组织只取 `org.path` / `org.name`。仅凭 HTTP 200 不能判定授权成功；不保存响应正文或真实员工资料到公开报告。

## 浏览器与权限变更回归

| 条件 | 期望 |
| --- | --- |
| 三种固定角色分别测试 | `lighthouse_user` 为普通员工；`lighthouse_knowledge_admin`、`lighthouse_admin` 具有现有知识管理能力 |
| 空角色或只有未知角色 | 拒绝登录/访问，不自动作为普通用户或访客 |
| 受控测试工号撤权、管理员降普通 | Web 与 HTTPS CLI/MCP 在缓存期限内失去对应能力；角色最多 5 分钟，管理员写入最多 1 分钟 |
| 中台查询失败、错误签名/业务码/账号/应用 | 不授予权限，失败不能延长缓存新鲜度，超过期限不能用过期权限 |
| IAM token 到期/失效 | 按 `expires_in` 和最多 5 分钟身份复验拒绝失效凭据；不声称实时感知离职 |
| 中台账号停用 | role-query 当前不检查 `sys_user.status`，可能仍有历史角色；只记录事实与已接受限制 |
| source sync/portal 或 AUTH_MODE 切换 | 原会话不能直接取得新模式权限，重新登录；本环境加密密钥保持稳定 |

测试角色变更由有权限的运维按现有中台流程操作，本说明不发写请求。HTTP 浏览器测试不能替代 CLI/MCP 的 HTTPS 联调。生产仍为 `AUTH_MODE=guest`，另验 public 资料与访客隔离。

## 证据边界

分别记录本地模拟、Bruno 实际导入执行和真实浏览器验收；尚未执行的标待内网，不填“通过”。记录环境/执行位置、version、revision、app/tools digest、场景、HTTP/业务状态和脱敏结论。禁止导出 Bruno secrets、请求签名、OAuth code/token、Cookie、JWT、完整员工资料或私有环境文件。不要把集合 HTML 报告直接上传公共 Issue。

# IAM 登录与统一中台角色授权

关联 [Issue #57 本轮实施范围](https://github.com/KeithChen51/Lantern/issues/57#issuecomment-6306989260)。本模式只修改灯塔：用户由 IAM 单点登录，灯塔按可信工号向统一中台查询本应用角色。不要求中台修改接口，不以 IAM 账号/权限同步作为前置条件。本文是配置与验收指引，本地模拟结果不能代表内网已部署或真实 IAM 已验收。

## 模式与权限边界

| 配置 | 身份与权限来源 | 模板 / 说明 |
| --- | --- | --- |
| `AUTH_MODE=guest` | 访客，仅已发布且 public 的资料 | [访客生产模板](../../deploy/intranet/environments/guest-app.env.example)、[访客部署](lighthouse-guest-mode.md) |
| `AUTH_MODE=iam`，`IAM_AUTHORIZATION_SOURCE=portal` | IAM 身份 + 中台 role-query 授权 | [员工 HTTPS 模板](../../deploy/intranet/environments/iam-portal-app.env.example)、[HTTP 测试模板](../../deploy/intranet/environments/test-app.env.example) |
| `AUTH_MODE=iam`，省略 source 或显式 `sync` | 原 IAM 身份 + 本地同步账号/权限投影 | [同步模板](../../deploy/intranet/environments/app.env.example)、[同步模式说明](lighthouse-iam-direct.md) |
| `AUTH_MODE=portal` | 原门户 token 身份 + 中台角色 | [原门户模式](lighthouse-access.md)；需要其完整原配置 |

本次测试选择第二行，现有生产继续显式 `AUTH_MODE=guest`。模式由部署配置选择；认证或授权失败不会自动降级访客，也不自动回退原门户。不同模式和 IAM 授权来源的会话隔离，切换后必须重新登录，旧门户或 IAM sync 会话不能直接获得组合模式权限。

登录流程：浏览器打开灯塔 → `/auth/iam/start` → IAM 授权码登录 → `/auth/iam/callback` → 灯塔后端交换 code 并调用 IAM `getUserInfo` → 以可信工号向中台 `POST /sso/admin/subapp/role-query` 查询角色 → 校验同工号、同应用及已知角色 → 建立灯塔会话。IAM token 仅由后端保存和复验，**不发送给中台 `infoByToken`**。中台卡片只需导航至灯塔 `/auth/iam/start`，不传旧门户 token。

组合模式只认可固定灯塔角色：

| 中台角色码 | 当前能力 |
| --- | --- |
| `lighthouse_user` | 员工浏览、知识读取、路引对话及已实现的员工功能 |
| `lighthouse_knowledge_admin` | 员工能力与已有 `knowledge:manage` |
| `lighthouse_admin` | 员工能力与已有 `knowledge:manage` |

无角色或只有未知角色均拒绝登录与访问；未知角色本身不授予能力。固定角色不读取 `PORTAL_KNOWLEDGE_ADMIN_ROLE` / `PORTAL_PLATFORM_ADMIN_ROLE`，也不会产生未实现的平台管理功能。CLI/MCP 仍仅提供员工已有的知识读取能力，不因浏览器管理员身份增加客户端写权限。

## 运行时配置

凭据仅写入内网私有运行文件或秘密管理，不提交源码、Bruno 集合或验收报告。私密目录 0700、文件 0600。模板不能整体覆盖运行环境；升级只合并确认过的认证字段，保留数据库、挂载、模型与本环境稳定的 `AUTH_ENCRYPTION_KEY`。

| 变量 | 组合模式要求 |
| --- | --- |
| `AUTH_MODE` / `IAM_AUTHORIZATION_SOURCE` | 精确 `iam` / `portal`；省略 source 仍为原 `sync`，不会自动选择组合模式 |
| `NODE_ENV` | 测试与正式均为 `production` |
| `LIGHTHOUSE_DEPLOYMENT_ENV` | 测试 `test`；正式 `production` |
| `LIGHTHOUSE_ORIGIN` | 正式为规范 HTTPS origin；本轮测试为 `http://10.0.147.68:16888` |
| `AUTH_TEST_HTTP_ORIGIN` | HTTP 测试必须逐字等于 `LIGHTHOUSE_ORIGIN`；正式留空 |
| `AUTH_ALLOW_LOCAL_HTTP` | 部署时固定 `false` |
| `IAM_BASE_URL` | 已登记 IAM 的规范 HTTPS origin，不带尾斜线、路径、query 或凭据；测试浏览器 HTTP 不放宽 IAM HTTPS |
| `IAM_CLIENT_ID` / `IAM_CLIENT_SECRET` | 灯塔 IAM 登记所得 App ID 与新密钥，不能使用中台应用密钥代替 |
| `PORTAL_API_BASE_URL` | 已确认的中台服务端 API 基础地址，可保留其基础路径；默认要求 HTTPS，不含 query、fragment、凭据 |
| `PORTAL_API_HTTP_ORIGIN` | 中台 API 确需 HTTP 时，填写其精确规范 RFC1918 IPv4 origin，必须等于 API 基础地址的 origin；HTTPS API 留空 |
| `PORTAL_APP_CODE` / `PORTAL_APP_SECRET` | 中台单独登记的本应用 appKey 与 HMAC secret；与 IAM secret 独立 |
| `AUTH_ENCRYPTION_KEY` | 本环境独立 Base64 32 字节本地加密密钥；升级和 source 切换保留原值 |
| 数据库 / 知识 / 模型 | 沿用有效 MySQL、`KNOWLEDGE_HUB_ENABLED=true`、`KNOWLEDGE_HUB_DRIVER=mysql`、DSH 和模型配置 |

**无需配置** `IAM_SYNC_*`、`PORTAL_LOGIN_URL`、`PORTAL_LOGIN_MODE`、`PORTAL_EMPLOYEE_VALIDATION_CONFIRMED` 或门户角色变量；不要用假的值补齐原模式字段。组合模式不提供原 IAM 同步目录/推送作为授权入口；需要该机制时显式选择 `sync` 并恢复完整同步配置。

本轮 HTTP 测试片段（其余真实参数从私有配置注入）：

```dotenv
NODE_ENV=production
LIGHTHOUSE_DEPLOYMENT_ENV=test
AUTH_MODE=iam
IAM_AUTHORIZATION_SOURCE=portal
LIGHTHOUSE_ORIGIN=http://10.0.147.68:16888
AUTH_TEST_HTTP_ORIGIN=http://10.0.147.68:16888
AUTH_ALLOW_LOCAL_HTTP=false
```

浏览器 HTTP 例外只接受规范 RFC1918 IPv4 的精确 origin，不接受域名、公网 IP、loopback、IPv6、通配符、路径或尾斜线。中台 API 的 HTTP 例外独立配置：合成示例 `PORTAL_API_BASE_URL=http://10.20.30.40:20002/api` 对应 `PORTAL_API_HTTP_ORIGIN=http://10.20.30.40:20002`。不跟随中台 API 重定向，不关闭 TLS 校验，不把该例外用于 IAM 服务端或生产浏览器入口。

HTTP 测试 Cookie 使用 origin 散列的独立测试命名空间，并带 `iam_portal_` 模式标识；`HttpOnly; SameSite=Lax; Path=/`，无 Domain，HTTP 不设 `Secure` / `__Host-`。HTTPS 使用 Secure。Cookie 无端口隔离，独立命名不能代替两环境数据库、挂载、会话及本地加密密钥隔离。CLI/MCP 服务 origin 仍要求 HTTPS，不能以本轮 HTTP 浏览器测试替代客户端真实验收。

## 中台查询和失效限制

灯塔后端以毫秒 timestamp 和独立中台密钥生成 `HMAC-SHA256(account + "." + timestamp)` 的十六进制签名，发送 `appKey`、`timestamp`、`sign` 请求头及 `{ "account": "可信工号" }`。只接受成功业务码、匹配的 `data.account` / `data.appCode` 及合法角色结构；不信任浏览器提供的工号，也不把角色名称当作员工身份凭据。

角色缓存最多 5 分钟，知识管理写入要求最近 1 分钟内验证；角色查询失败不能延长新鲜度，超过期限不能继续使用过期权限。角色清空或只剩未知角色后拒绝访问；管理员降为普通角色后失去知识管理能力。IAM token 有效期受交换返回的 `expires_in` 限制，身份至少每 5 分钟复验；未确认完整刷新协议，不猜测 refresh 接口。

**已接受的限制：当前中台 role-query 不检查 `sys_user.status`。** 中台停用账号可能继续返回历史角色，用户已明确接受本轮不修改中台；不能据此宣称停用或离职实时失效。IAM 复验也不代表已验证上游停用的即时传播。测试应分别记录中台撤角色、IAM 凭据失效、中台账号停用三个场景，最后一项只记录实际结果与此限制。

当前 IAM `getUserInfo` 文档只保证 `loginName` 作为工号，不保证姓名。组合模式的姓名取自同工号、同应用中台响应的可选 `data.name`，姓名缺失时显示“姓名暂未获取”，工号单独显示。组织仅取 `org.path`，无路径时取 `org.name`；缺失显示未提供。姓名与组织均不参与身份关联或授权。

### 姓名消费端约定（Issue #69）

**这是灯塔新增的消费端支持，不是中台已经提供该字段的证明。** 目前中台文档只在需要门户 token 的 `infoByToken` 中定义了 `data.name`，现有 `role-query` 文档尚未定义个人姓名。部署方须确认实际 `role-query` 响应包含下列字段，或由中台补齐同一响应；不能只部署灯塔就宣布真实姓名接入完成。

```json
{
  "code": "000000",
  "data": {
    "account": "SYNTHETIC_EMPLOYEE_001",
    "appCode": "lighthouse",
    "name": "测试员工",
    "roles": [{ "code": "lighthouse_user" }]
  }
}
```

- 请求、签名及凭据与既有角色查询相同，不增加请求，不把 IAM token 发给中台，不调用 `infoByToken`。
- `data.name` 是员工个人姓名，不是角色或组织名称。只在成功业务响应且 `account`、`appCode` 均匹配后使用；不读取未知别名或 IAM 未约定的姓名字段。
- 姓名为可选字符串，最多 120 个 UTF-16 代码单元，去除首尾空白；空值、非字符串、控制字符、超长值或等于工号均按缺失处理。资料无效不改变角色权限；账号、应用或授权响应错误仍按原规则拒绝。
- 登录时合入姓名；既有会话在下一次成功角色查询时补齐或更新，通常最多 5 分钟，管理员写入最多 1 分钟。IAM 身份复验只验证工号，不覆盖中台姓名。成功响应中缺失或清空姓名时移除旧显示名；查询失败不能延长授权有效期。
- `/api/auth/me`、页面会话、导航和“我的”页面使用同一显示名；旧会话仅存工号时也不会把它作为姓名展示。无需数据库迁移、重新初始化或修改现有用户 ID。现有用户影子表及历史内容的署名不做批量回写，当前展示以会话资料为准。
- 内网验收至少核对真实姓名与工号分别显示、IAM 复验后姓名保留、中台姓名更新/缺失后的刷新、旧会话补齐和撤权回归。日志与公开报告只记录脱敏结论。

回退到本次变更前的应用镜像时，无需回滚数据库；可选姓名字段不会改变旧版本角色解析。真实姓名尚未返回时应标记“灯塔消费端已支持，待中台字段与内网验收”，保持 Issue #69 开放。

## 内网启用与回退

1. 在 IAM 为灯塔登记测试 origin 的精确 `/auth/iam/callback`，取得 IAM 独立凭据；确认授权码和浏览器 OA 会话流程。入口仍为 `/auth/iam/start`，state 必须由真实浏览器事务产生。
2. 从 **68 应用容器的实际网络**验证 IAM HTTPS/DNS、中台 API 连通性与 HMAC 角色查询。工作站可访问不能证明应用网络可达；ready 200 也不能证明真实凭据或角色正确。
3. 在中台现有应用中为受控测试工号授予三种已知角色，准备空角色、未知角色、降权与撤权测试。应用 secret 不与 IAM secret 共用；不要求中台提供新接口或改账号状态逻辑。
4. 保存旧模式配置、compose/project、固定 app/tools 配对 digest、数据库/挂载位置和本地密钥。将组合模式字段合并到私有应用文件，保留原数据库、上传和知识数据。此功能没有数据库结构或知识内容变更，不因切换认证初始化或导入知识。
5. 按[原部署流程](production-environments.md)执行既有测试 `existing-test.sh upgrade`。新环境仍用 `environment.sh` 的原路径。它们把最终 compose JSON 中应用的完整环境交给同提交 tools 镜像预检，在停应用、备份和迁移前拒绝错误配置。compose 的 `env_file` 必须包含 source 和两套凭据；工具镜像默认环境不能补齐应用缺项。修改 env 后须重建应用容器，不能只 restart。
6. 执行下表真实验收，记录本地模拟与内网结果各自的版本、revision、app/tools digest、位置、状态码与脱敏结论。1.3.0 先交付内网测试，生产继续 `AUTH_MODE=guest`；main 交付与内网部署分别记录，测试验收通过后再评估正式环境。

回退时显式恢复已确认兼容的 app/tools 镜像及完整旧模式私有配置，保持本环境密钥和数据位置，评估迁移兼容性后按既有恢复流程执行。切回 `sync` 需完整同步凭据与账号角色投影；切回 `portal` 需完整门户配置。失败不会自动切模式、回滚数据库或开放访客。

另建全新隔离测试栈时，`test.env.example` 默认使用独立端口 18081，不能与现有 16888 栈共用 project、数据或 origin。该栈私有应用文件的两个 origin 必须改为其实际 IP/端口，并另行登记精确 callback；现有测试升级仍保留 16888。

## 验收与证据

[组合模式 Bruno 验收说明](../../tests/bruno/iam-portal/README.md)可复用原集合中的匿名 / 当前会话检查；原 IAM 目录和同步请求只适用于 `source=sync`。OAuth 浏览器一次性 state 不能用手拼请求绕过；API 工具成功不等于浏览器回调成功。API 测试仅用合成变量或经过授权的只读查询，不自动修改真实账号。

| 场景 | 预期与记录 |
| --- | --- |
| 无痕直接访问、已有 / 无 OA 会话 | 发起 IAM，真实回调后回安全站内地址；免密码行为由 IAM 决定 |
| state 缺失/篡改、换浏览器、code/回调重放、外站 returnTo | 拒绝会话或外站回跳；不手工补 state |
| IAM 成功且中台三种已知角色 | 分别验证普通/知识管理员/平台管理员当前能力、我的工号与组织 |
| 空角色、只有未知角色、工号或 appCode 不匹配 | 拒绝登录或后续访问 |
| 中台签名、业务码错误或服务失败 | 不授予权限，超过缓存期限不能沿用过期角色，不降级访客 |
| 撤角色、管理员降普通、查询失败跨越 1/5 分钟 | Web 与 HTTPS CLI/MCP 失权；管理员写入按 1 分钟期限复核 |
| IAM token 到期/失效、中台停用账号 | 分别记录；不能把 role-query 的账号状态限制记成已修复 |
| 原 portal、IAM sync、组合模式之间切换 | 旧 Cookie/会话不直接取得新模式权限，必须重登；工号关联与业务数据保留 |
| 退出与生产访客回归 | 仅结束灯塔会话，不自动退出 OA；guest 继续仅 public 资料，失败不自动降级 |
| 升级前后资料与附件 | 数据库、目录、知识版本、上传文件保留，不重置或初始化 |

仓库自动化只证明本地模拟协议、配置和回归结果。真实 IAM 凭据、回调登记、应用网络、Bruno 导入执行、浏览器 Cookie、三角色授予与撤权、HTTPS 客户端联调均须内网执行。报告只保存必要脱敏结论，禁止记录 client secret、中台 secret、OAuth code/token、Cookie、JWT 或完整个人资料。单点注销要求与仅退出灯塔的产品行为仍需 IAM 对接确认，不能把本地退出标成 IAM 全局注销通过。

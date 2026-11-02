# 灯塔直连 IAM：配置、切换与联调

**适用模式：** `AUTH_MODE=iam` 且 `IAM_AUTHORIZATION_SOURCE=sync`（省略 source 也保持此模式）。本文的账号/权限同步、同步密钥和目录验收只适用于该模式。Issue #57 后续新增的 **IAM 登录 + 统一中台角色授权** 使用 `IAM_AUTHORIZATION_SOURCE=portal`，无需同步前置条件，见[组合模式配置与验收](lighthouse-iam-portal.md)。本轮 HTTP 测试模板已选择组合模式；本文同步方案使用 `app.env.example` 并填写本环境 origin。

关联 [Issue #57](https://github.com/KeithChen51/Lantern/issues/57)。本说明基于[内网 IAM 接入指南](https://sefd-aftersales.bydauto.com.cn/r/workspace-mu7uz523/iam/)的国内内部员工单点登录、账号同步及集团权限平台 RBAC 协议。是否完成真实接入，以目标环境验收记录为准；本地模拟测试不代表 IAM 已登记或网络已放行。

## 最终访问方式

- 用户直接打开灯塔：未登录时显示灯塔登录页，只有“OA 登录”入口；由灯塔发起 IAM 授权码流程，完成后返回原先安全的站内页面。浏览器已有 OA 会话时，是否免输密码由 IAM 决定。
- 中台卡片只做导航，地址登记为 `灯塔 origin/auth/iam/start`。不再向灯塔传中台 `token`，也不把中台角色查询作为 IAM 模式的权限来源。
- IAM 后端 `getUserInfo` 确定工号；账号资料与角色来自已验签、解密并落库的 IAM / 集团权限平台同步。OAuth 登录成功不等于拥有灯塔访问权：有效账号及灯塔允许角色都必须先同步。
- 普通用户为 `lighthouse_user`。`lighthouse_knowledge_admin` 与 `lighthouse_admin` 均可管理知识；仅 `lighthouse_admin` 可打开 Web [访问与使用汇总](../platform-management.md)。该角色不授予个人访问明细或聊天排查权限。
- 当前产品退出行为是只结束灯塔会话，回到灯塔登录页，不自动重登、不退出 OA。官方验收指南要求 IAM 注销 / 超时注销，与此产品约定有差异；上线前必须与 IAM 明确验收口径及适用注销接口，不能把仅本地退出标成 IAM 单点注销通过。

## 向 IAM 登记的端点与方向

以测试 `http://10.0.147.68:16888` 或实际正式 HTTPS origin 替换下表前缀：

| 用途 | 端点 / 方向 |
| --- | --- |
| 中台卡片或 OA 导航 | 浏览器 → 灯塔 `GET /auth/iam/start` |
| OAuth 回调 | IAM → 浏览器 → 灯塔 `GET /auth/iam/callback` |
| 账号新增、修改、删除、停用 | IAM / 集团权限平台 → 灯塔 `POST /api/iam/sync/account` |
| 用户岗位角色授予、收回 | 集团权限平台 → 灯塔 `POST /api/iam/sync/permission` |
| 灯塔角色目录拉取 | 集团权限平台 → 灯塔 `GET /api/iam/roles` |
| 灯塔菜单目录拉取 | 集团权限平台 → 灯塔 `GET /api/iam/menus` |

角色目录是**灯塔定义什么角色**，由灯塔提供给权限平台；权限同步是**某个工号在某个岗位得到什么角色**，由权限平台推给灯塔。这两个方向不能互换。岗位独立授权、权限有效期、停用与删除均影响登录后的访问；不要用一次 OAuth 返回或中心角色目录代替用户授权。

测试和正式 callback 能否共用一个 clientId、是否支持 HTTP 测试回调，以 IAM 登记结果为准。测试 HTTP 只允许上面确认的精确 origin；不因测试浏览器用 HTTP 就把 IAM 服务端协议降为 HTTP。正式浏览器入口继续使用 HTTPS。

## 运行时变量

原同步模式从 `deploy/intranet/environments/app.env.example` 填写私有运行文件，测试部署另填写其 `test` 标记及精确测试 origin；当前 `test-app.env.example` 是组合模式模板，不能直接用于本文同步验收。模板不是现有环境的自动迁移脚本。所有凭据只在内网私有运行文件或受控密钥系统注入。

| 变量 | 内容 |
| --- | --- |
| `AUTH_MODE` | `iam`；显式 `portal` 仅为保留完整原配置的兼容回退模式，不是 IAM 失败后的自动降级 |
| `IAM_AUTHORIZATION_SOURCE` | 本文为 `sync`，省略时相同；`portal` 见独立组合模式指引，不使用本文同步配置 |
| `NODE_ENV` | 测试、正式均为 `production`，使用同一生产构建约定 |
| `LIGHTHOUSE_DEPLOYMENT_ENV` | 测试 `test`，正式 `production` |
| `LIGHTHOUSE_ORIGIN` | 测试 `http://10.0.147.68:16888`；正式实际 HTTPS origin |
| `AUTH_TEST_HTTP_ORIGIN` | 测试与 `LIGHTHOUSE_ORIGIN` 完全相同；正式留空 |
| `AUTH_ALLOW_LOCAL_HTTP` | 部署环境固定 `false`；不是 HTTP 测试的开关 |
| `IAM_BASE_URL` | IAM 国内环境的规范 HTTPS origin，如 `https://sso.byd.com`；不带末尾斜线、路径、查询或凭据 |
| `IAM_CLIENT_ID` / `IAM_CLIENT_SECRET` | IAM 单点登录注册所得，不能复用中台 appKey / HMAC secret |
| `IAM_SYNC_APP_KEY` | 集团权限平台同步登记的确切 appKey，与 JWT 发行者匹配 |
| `IAM_SYNC_PUBLIC_KEY` | IAM 同步 JWT 的 RSA 公钥：Base64 编码的 SPKI DER 内容 |
| `IAM_SYNC_AES_KEY` | 同步协议的独立 Base64 32 字节 AES-256 密钥 |
| `IAM_SYNC_AES_IV` | 与 IAM 约定的 Base64 16 字节 CBC IV |
| `AUTH_ENCRYPTION_KEY` | 灯塔本地加密上游凭据的独立 Base64 32 字节密钥，升级保留原值；不是同步 AES key |

MySQL、知识库与模型等原有变量保持各自配置。IAM **sync** 模式不需要 `PORTAL_*`，不得为了通过校验填写假的门户 URL、员工确认值或密钥。完整配置由应用自身 `readAccessConfig` 检查；配置通过不代表账号已同步、接口可达或 OAuth 已验收。组合模式需要独立中台 API/appKey/secret，不使用本文的同步账号作为权限依据。

IAM OAuth 使用浏览器 `/idp/authCenter/authenticate`，服务端通过表单 POST `/gateway/bam-protocol-service/oauth2/getToken` 交换一次性 code，再 GET `/gateway/bam-protocol-service/oauth2/getUserInfo` 查询身份。token 和 client secret 只在服务端处理。文档未定义可直接使用的完整刷新协议，本实现不猜测 refresh 端点，登录有效期受上游 `expires_in` 约束。

同步采用登记的 `appKey` 和 RS256 JWT，以及 `{ "data": "AES ciphertext" }` 信封；JWT 为数值秒时间声明，消息按 AES-256-CBC 解密并验证结构。GET 目录接口也要求同步认证并返回加密目录。不要把中台 `HMAC-SHA256(account.timestamp)` 请求头复制到这些接口。

## 切换前置条件

1. IAM 注册单点登录、内部员工账号同步、权限同步及角色 / 菜单目录，取得独立凭据与公钥、AES 参数；确认工号字段、角色码、岗位授权及 HTTP 测试 callback。
2. 从 **68 的应用网络**验证 `IAM_BASE_URL:443` 及 DNS。此前核查 68 → `sso.byd.com:443` 超时，工作站能登录不能证明部署网络可用。
3. 放行 IAM / 权限平台 → 灯塔已登记同步和目录入口；反向代理保留 `appKey` / `Authorization`、方法、请求体，不能把同步请求重定向到浏览器登录。
4. 确认初始账号及岗位角色同步机制、失败重试 / 重送与差异核对操作。指南没有给出完整事件 ID、版本顺序或全量对账契约；不能声称已消除所有乱序、延迟事件风险。遇到疑似旧授权重送时先核实当前权威状态，再按确认结果重同步，保留脱敏证据。新增 → 撤回 → 再新增必须由平台签发新的 JWT 进行新事件推送，不能把早先的完整报文当作新授权复用。权限 `expiresTime` 必须按已确认的时间语义提供，不把 0、空值或未定义值擅自当作永久授权。
5. 分别保存测试、正式的私有配置及稳定本地加密密钥，备份数据库和上传目录。没有异机备份服务器时，现有 68 本机备份只能覆盖误操作，不能覆盖该机故障；恢复演练仍须完成。

## 先测试，后正式

### 现有测试环境

**1.2.3 提前部署、IAM 后启用：** IAM 接入手续尚未完成时，可以先按现有升级流程部署 1.2.3 配对镜像。此阶段显式保留 `AUTH_MODE=portal` 及已验证的完整 `PORTAL_*` 配置、测试 origin、加密密钥和持久化挂载，不用新版 IAM 示例文件整体覆盖现有私有环境文件。镜像内仍支持门户模式，不会因版本升级自动切换 IAM。升级后先验证原中台卡片登录、知识资料和附件，再记录“1.2.3 已部署，IAM 尚未启用”；不要据此宣称直连 OA 登录已通过。若原门户配置本身不完整，须先补齐其真实配置，不能用占位值通过预检。

待 IAM 前置条件齐备，再按以下步骤切换模式；使用同一 1.2.3 镜像时无需仅为注入环境配置重新构建。

1. 保持旧容器、旧模式配置与数据运行，先完成新镜像构建和 IAM 登记、网络准备。镜像仓库 tag 更新不会自动替换运行容器。
2. 保存当前 compose、实际运行配置、应用与工具镜像摘要；在私有运行文件填齐 IAM 参数，保留当前数据库连接、数据卷和原 `AUTH_ENCRYPTION_KEY`。
3. 对准备切换的应用 / 工具镜像核对同一完整 revision 和 version，固定仓库 digest。按 [原部署流程](production-environments.md)执行现有测试 `existing-test.sh upgrade`；其完整配置预检在停应用、备份、迁移前执行，参数错误不进入运行态变更。不要只运行裸 `docker compose up` 绕开备份和迁移。
4. 通过已登记同步入口完成初始账号及三种角色的测试工号授权。若切换后才可推送，期间属于维护窗口，未获同步的员工不应登录成功。
5. 完成下方浏览器、API、撤权回归后，才记录“测试环境已联调通过”。不要把健康检查 200 当作 IAM 完整验收。

`environment.sh initialize / upgrade` 同样在数据库操作或停应用前检查所选 production/test 的完整认证配置。新正式环境的空库初始化与老环境升级仍是两条路径；升级不导入初始知识，不覆盖现有知识及附件。

IAM 模式使用独立认证边界，旧门户会话不会变成 IAM 会话。已有可信工号映射继续关联原业务用户和数据；IAM 认证依据与本地用户 ID 是不同概念。不能按任意邮箱、显示名或演示账号合并用户。

### 正式环境

只有测试验收通过，再把 dev 通过 PR 合入内网 master，构建正式镜像。新建正式空库并按已确认清单初始化；正式独立数据库、上传目录、配置、会话及本地加密密钥，不复制测试会话。随后配置正式 HTTPS 回调与同步入口、完成正式初始账号 / 权限同步及一次真实登录、撤权验收。

### 失败与回退

配置预检失败时应用尚未停止，修正本机代码或内网私有配置后重新验证。备份失败、迁移失败按原脚本既有停止 / 恢复规则处理；不得自动回滚数据库。新认证失败时保留备份与脱敏日志，记录阻塞，不启用密码后门或自动回退门户。

确需恢复旧模式，显式选回经确认的旧镜像及完整原 `AUTH_MODE=portal` 配置，核对迁移兼容性后按既有恢复步骤执行。旧门户是否仍提供服务及旧会话是否可用需单独验证；回退不会替代 IAM 上线验收。

## 联调证据

`tests/bruno/iam-readonly` 提供不修改账号授权的 API 检查；先填本机 secret 变量，再执行，不把 token / JWT / 返回的员工个人信息导出到 HTML。目录接口有效 JWT 由 IAM 管理方提供或在仅模拟密钥的隔离测试环境生成；真实 IAM 私钥不应交给灯塔或写入测试集合。账号 / 权限写入测试由 IAM 正式推送，不能向生产用手工伪造的授权数据验收。

必须记录实际执行位置（工作站 / 68 应用网络）、版本、revision、镜像 digest、HTTP / 业务状态和结论；严禁在报告中记录 code、token、secret、JWT 或完整个人资料。

| 场景 | 期望 |
| --- | --- |
| 无痕直接打开受保护页面 | 灯塔登录页，OA 按钮可用；不显示已登录业务内容 |
| 已有 OA 会话 / 尚未登录 OA | 分别验证 IAM 复用会话或官方登录后返回原灯塔页面 |
| state 缺失、篡改、他浏览器使用、重复 code / 回调 | 失败且不创建登录会话；不能手工补 state 绕过 |
| 中台卡片 | 只导航 IAM start，使用同一直接登录链路；不消费旧中台 token |
| OA 有效但账号未同步、停用、删除或没有有效灯塔角色 | 拒绝进入受保护功能 |
| 普通用户 / 知识管理员 / 平台管理员 | 核对实际能力；管理员权限仅覆盖当前实现范围 |
| 一个工号多个岗位授权 | 收回其中一个岗位不误删仍有效的其他岗位授权；过期授权不生效 |
| 登录后停用 / 撤权 / 过期 | 浏览器、CLI、MCP 均不能保留已失去的权限 |
| 同步 JWT 错签、过期、错误 issuer / appKey，密文或内容错误 | 非成功响应，数据库不发生对应变更 |
| 退出灯塔 | 本地会话失效，回灯塔登录页，显示已退出；不会自动重登 |
| 升级前后数据 | 原知识、目录、附件、已有用户业务记录保留；只执行必要迁移 |

真实 OAuth、同步重送、权限撤回、代理请求头和浏览器 cookie 行为须在内网验证。本机自动化结果应单列为模拟协议验证，不与上述内网验收混写。

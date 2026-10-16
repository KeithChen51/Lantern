# lighthouse 员工访问部署

关联 [GitHub Issue #48](https://github.com/KeithChen51/Lantern/issues/48)。本文描述应用部署契约，不代表门户平台、真实 MySQL、迁移或生产环境已经验收。

## 权限与客户端

所有业务浏览、知识读取、路引对话和附件访问要求门户验证的有效员工身份。有效员工即使角色列表为空仍可浏览；当前应用的指定知识管理员角色，或显式配置的精确平台管理员角色，提供已有 `knowledge:manage`，仅用于知识中台管理。灯塔仅保存必要的身份映射和授权状态，不在本地分配人员或角色，不新增平台管理、Action、Workshop 或反馈提交权限。角色名称不能推导权限语义，须由门户确认对应的精确标识。

员工 CLI/MCP 是独立的 `packages/lighthouse-client` 包。员工在已登录浏览器中确认设备授权，客户端只取得 `knowledge:read`，由员工自己的 Agent 完成推理；无对话、知识写入或交互沉淀工具。员工包不能包含门户应用密钥、数据库地址、服务器环境文件或直连数据库的运维工具。

现有 `npm run hub`、`npm run hub:mcp` 和镜像内 `knowledge-cli` 是可信运维维护接口，直接访问数据库；不得作为员工接入方式或向员工分发。服务器镜像及 DSH carrier 是服务器运维产物，不是员工客户端。

## 配置

以 [.env.example](../../.env.example) 为字段说明，在部署环境使用秘密管理或私有环境文件注入真实值；不要把真实 `.env`、员工样本、内部地址或密钥提交到公共仓库或构建产物。

| 变量 | 要求 |
| --- | --- |
| `AUTH_MODE` | 必须为 `portal`，无生产 demo/mock 回退 |
| `LIGHTHOUSE_DEPLOYMENT_ENV` | `production` / `test` / `development`；production 构建未设置时默认 `production`，其它运行模式默认 `development`。production 构建不接受 `development` |
| `LIGHTHOUSE_ORIGIN` | 对外 origin，正式部署必须 HTTPS；仅协议/主机/端口，无路径、query、fragment 或内嵌凭证。HTTP 测试须满足下方精确例外 |
| `AUTH_TEST_HTTP_ORIGIN` | 默认空；只有 `test` 部署可填写，必须是与 `LIGHTHOUSE_ORIGIN` 完全相同的规范 HTTP 内网 IPv4 origin。不能用于放宽门户 API 或登录地址 |
| `PORTAL_API_BASE_URL` | 已确认的服务端 API 基础地址，默认要求 HTTPS；HTTP 须配置下方精确例外。不能含内嵌凭证、query 或 fragment |
| `PORTAL_API_HTTP_ORIGIN` | 默认空；服务端 API 已确认使用内网 HTTP 时显式填写其规范 RFC1918 IPv4 HTTP origin，必须与 `PORTAL_API_BASE_URL.origin` 相同，不能有尾斜线/路径。生产和测试均可使用；不改变浏览器入口或 TLS 校验 |
| `PORTAL_LOGIN_URL` | 浏览器门户固定登录入口，部署时要求 HTTPS，不能含内嵌凭证或 fragment |
| `PORTAL_LOGIN_MODE` | `card` / `callback`；代码缺省为 `callback` 保持旧部署兼容，部署示例显式选 `card`。只有门户已确认支持 `redirectUrl` / `state` 契约时才选 `callback` |
| `PORTAL_APP_CODE` / `PORTAL_APP_SECRET` | 平台分配的当前应用标识和密钥；secret 仅在服务端运行时注入 |
| `PORTAL_KNOWLEDGE_ADMIN_ROLE` | 当前应用知识管理员的精确角色标识 |
| `PORTAL_PLATFORM_ADMIN_ROLE` | 可选；门户确认的平台管理员精确角色标识，映射到已有 `knowledge:manage`；为空时不启用此映射 |
| `AUTH_ENCRYPTION_KEY` | 专用随机 32 字节密钥的 base64 编码；与数据库备份一同受控保存，不能用示例值 |
| `PORTAL_EMPLOYEE_VALIDATION_CONFIRMED` | 平台确认身份查询成功表示当前有效内部员工后，才显式设置 `true` |
| `PORTAL_CALLBACK_PARAM` / `PORTAL_STATE_PARAM` / `PORTAL_TOKEN_PARAM` | 默认 `redirectUrl` / `state` / `token`；callback 模式须匹配已确认的回调契约；card 模式也使用 token 字段。三者名称不能相同 |
| `PORTAL_ALLOW_LEGACY_CONFIRMATION` | 默认 `false`；仅在另行批准旧回调方案后开启显式身份确认，不能自动接受未绑定回调 |
| `AUTH_ALLOW_LOCAL_HTTP` | 部署时为 `false`；只有非 production 运行模式且 deployment=`development` 的 localhost、127.0.0.1 或 [::1] URL 可开启。不能用它实现内网测试 |
| `DATABASE_URL` | 生产必须配置 MySQL；无 SQLite 或本机空库自动回退 |
| `KNOWLEDGE_HUB_ENABLED` / `KNOWLEDGE_HUB_DRIVER` | 生产必须为 `true` / `mysql` |

可在安全的运维环境用 `openssl rand -base64 32` 生成加密密钥并直接存入秘密管理。丢失或更换该密钥会使已有加密的上游授权无法读取；换钥需要规划授权失效、重新登录及回滚，不要在每次容器启动时生成新钥。

共享管理员密码、旧 admin cookie 安全开关、预览身份与演示种子不再建立员工或知识管理员会话。生产不要运行演示用户种子来解决登录问题。有效员工与历史演示身份不会自动合并。

## 门户卡片与事务回调

当前门户只证实应用卡片携 token 跳入灯塔，尚未证实 `redirectUrl` / `state` 协议。部署选择 `PORTAL_LOGIN_MODE=card`：未登录访问业务页显示门户引导，`POST /api/auth/start` 仅跳转固定 `PORTAL_LOGIN_URL`，不附加灯塔构造的回调地址或 state。员工在门户点击已配置的灯塔卡片进入根路径 `/?token=…`，也可进入 `/auth/portal/callback?token=…`。token 由服务端向门户验证；验证后仅建立本浏览器的待确认 Cookie，并立即跳到不含 token 的确认地址。员工核对账号并显式提交带同源/CSRF 校验的 POST 后，灯塔才创建 Web 会话；缺 token、无效 token、确认重放或错误 CSRF 不建立会话。不要将 token 写入公开报告、访问日志或错误日志。

已登录员工直接访问灯塔沿用有效会话；“我的”入口显示当前身份并提供退出。card 模式并不证明门户支持往返任意业务地址；验收以门户登记的固定卡片入口为准。确认页必须由员工实际核对身份，不能自动点击或把 GET 进入视为登录同意。

`PORTAL_LOGIN_MODE=callback` 保留原事务回调方式：先创建登录事务，回传 token 时必须匹配浏览器事务和 state。只有门户明确支持参数、返回地址及原样 state 回传后才能启用和验收。card 模式的显式确认流程不代表 callback 模式可以放弃 state；历史 `PORTAL_ALLOW_LEGACY_CONFIRMATION` 也不能替代模式选择或门户契约确认。

服务端 HTTP API 例外与浏览器测试 HTTP 例外分别配置。例如 API 基础地址为 `http://10.20.30.40:20002/api`，填写 `PORTAL_API_HTTP_ORIGIN=http://10.20.30.40:20002`；该值必须逐字为标准 origin，拒绝域名、公网 IP、loopback、IPv6、尾斜线、路径、query、fragment、凭证、空白、非规范 IP 和错误端口。API 重定向不跟随；例外只允许该已确认 origin，不设置全局 TLS 关闭选项。门户浏览器登录始终 HTTPS，生产灯塔入口也始终 HTTPS。

## production 构建下的 HTTP 内网测试入口

测试保留部署方现有 HTTP 内网 IP，正式环境使用 HTTPS 域名；两者均运行 `NODE_ENV=production`，使用同一生产构建。认证不依赖把测试服务器改为 development 模式。以下地址是合成示例，部署方填写实际 IP 和端口，不修改现有测试入口：

```dotenv
NODE_ENV=production
AUTH_MODE=portal
LIGHTHOUSE_DEPLOYMENT_ENV=test
LIGHTHOUSE_ORIGIN=http://10.20.30.40:3080
AUTH_TEST_HTTP_ORIGIN=http://10.20.30.40:3080
AUTH_ALLOW_LOCAL_HTTP=false
```

两个 origin 必须逐字一致，并为规范形式：只接受 RFC1918 IPv4（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）；不接受域名、通配符、公网 IP、loopback、IPv6、路径、尾斜线、query、fragment、用户信息、空白或非规范 IP 写法。默认 80 端口省略 `:80`，其它端口明确填写。只填测试标记或只填 HTTP 地址均不会开启例外；不匹配地址/端口直接导致配置未就绪。正式部署必须设置 `LIGHTHOUSE_DEPLOYMENT_ENV=production`、HTTPS `LIGHTHOUSE_ORIGIN` 并清空 `AUTH_TEST_HTTP_ORIGIN`；误带 HTTP 测试例外会拒绝启动业务访问，不会放宽正式环境。

HTTP 测试 Cookie 保留 `HttpOnly; SameSite=Lax; Path=/`，不设置 Domain，省略 HTTP 无法使用的 `Secure` 和 `__Host-`；名称为 `lighthouse_test_<origin SHA-256 前16位>_session/login/pending`。不同测试 origin 使用不同名称，正式环境仍使用 `__Host-lighthouse_session/login/pending` 和 `Secure`。Cookie 本身不按端口隔离，独立名称不能替代部署隔离：测试与生产必须使用独立数据库、上传存储、会话 Cookie 和本地认证加密密钥，正式域名不能复用测试 HTTP 入口。已确认的门户 appKey（`PORTAL_APP_CODE`）、配套 `PORTAL_APP_SECRET` 和角色标识可以共用；这不意味着两个环境的本地会话、数据或 `AUTH_ENCRYPTION_KEY` 可共用。门户仍须分别确认测试、生产卡片落点。HTTP 传输没有 TLS 保密性，测试入口只应在部署方控制的内网可达。

部署方另需提供表格中的 MySQL、知识中台、已确认的门户 API/HTTPS 登录地址、应用编码/密钥、精确管理员角色、员工有效性确认和加密密钥。production 构建下的数据库检查不会因 `test` 标记跳过。同源写入仍精确匹配协议、IP 和端口，CSRF、card 身份确认或 callback 事务/state 及安全回跳校验继续执行，不信任客户端的 Host/转发头来生成回跳地址。HTTPS 测试可省略 HTTP 例外，此时 Cookie 同样有独立测试名称并使用 Secure。

门户卡片须登记与灯塔配置一致的固定入口；HTTPS 门户跳入 HTTP 测试入口的真实浏览器行为仍需内网联调。callback 模式另需确认精确 `/auth/portal/callback` 地址、state 原样回传及返回地址限制，不能把 card 模式已可用当作该协议已支持。通过普通员工、知识管理员和已配置的平台管理员完整登录、确认、退出、撤权后才能验收。员工 CLI/MCP 继续只接受 HTTPS 服务 origin，不提供全局关闭 TLS 校验或 HTTP bearer 例外，不能用 HTTP 测试入口完成员工工具联调。

2026-10-13 本地验证：新增配置和 HTTP 登录链路共 38 项测试，使用真实认证服务/路由、合成门户及内存事务库，覆盖错误地址/端口、生产误开例外、Cookie 属性、会话、退出、CSRF、state 和回跳重放；全量 459 项通过，lint、TypeScript、production 构建通过。使用上述合成 HTTP 测试 origin 运行 production standalone，38 项匿名访问/静态文件/健康检查通过，数据库不可用时 ready 仍为 503。独立规格和质量审查通过；以上不替代真实门户、浏览器或 MySQL 验收。运行过程及环境限制见[验证记录](lighthouse-access-verification.md)。

## 会话与权限变化

登录后侧栏底部统一为“我的”（`/me`）。页面显示已验证姓名、工号、登录状态和组织架构；组织仅使用同工号、同应用的 `role-query.data.org.path`，无路径时使用 `org.name`，缺失时显示“暂未提供”，不参与权限计算。当前门户契约未确认头像字段，使用姓名头像占位。版本消息和建议反馈入口收拢于此，工具授权及退出登录保留。个人资料页及其会话接口均须通过员工认证。

建议反馈当前提供清楚的“提交暂未开放”页面；此前已停用的提交 API 保持关闭，不会将员工意见写入未配置的接收系统。

HTTP 测试的原生登录/确认表单保持严格 Origin 与 CSRF 检查；公开认证页使用 `strict-origin`，避免 `no-referrer` 使浏览器把同源表单 Origin 置为 `null`。带凭据的卡片/回调响应仍使用 `no-referrer`，先 303 清除 token，之后才呈现确认页。

Web 会话绝对上限 8 小时、闲置上限 60 分钟；Cookie 为 HttpOnly，HTTPS 使用 Secure，Cookie 写操作需要同源和 CSRF 校验。身份有效性缓存最多 5 分钟，角色缓存最多 5 分钟，知识管理写操作要求最近 1 分钟内验证权限；上游故障不能延长缓存新鲜度。角色服务故障在有效缓存过期后关闭管理权限，不把有效普通员工自动升级。

工具 access token 有效期 5 分钟，refresh token 轮换并拒绝重放，设备/客户端授权总时长不超过 8 小时及上游授权期限。每次请求检查本地吊销状态。Web 显式退出会吊销该登录授出的待确认/已确认工具授权；仅 Web 闲置超时不会自动吊销此前确认的工具。员工可在自己的工具授权列表撤销设备；没有本地管理员分配员工权限的入口。

## MySQL 部署顺序

1. 停止旧应用写入，记录应用提交、镜像、环境配置、加密密钥与现有数据库/上传存储位置；备份 MySQL、上传文件和原 SQLite 文件（如有），在隔离环境验证备份可读。
2. 按[生产与测试部署流程](production-environments.md)，使用与新应用同提交、同版本的可信运维镜像执行迁移。该镜像已携带 Prisma、迁移和离线引擎，无需服务器源码或运行时安装 npm 依赖。Prisma 迁移必须先于新应用启动。不要从员工工具包执行迁移。
3. 既有 HTTP 测试环境只走保留原库、原卷的升级流程，不导入初始资料。仅新建空生产环境显式执行 `inventory` 预览、`initialize` 初始化确认的 22 项资源与 4 个文件夹；已有数据时拒绝初始化。`hub:import-existing` 留给独立审核的内容操作，不是部署步骤。不要在容器每次重启时自动导入、发布或迁移。
4. 配置经过验证的门户契约、角色与密钥，挂载原有上传/数据持久存储，启动新应用。无真实环境配置时保持业务访问关闭。
5. 检查 `/api/health/ready`，再验证普通员工（含空角色）、知识管理员、匿名拒绝、已撤销/过期授权、管理员降权、已发布资源版本/附件、路引所属用户隔离及员工设备授权。

源码构建和镜像组装通过只说明产物形成，不能替代真实门户/MySQL 联调。生产运维也须验证迁移表、数据库与文件版本一致，以及重新启动后的数据保留。

## 既有 SQLite 与文件存储

SQLite 继续支持独立的知识运维，不作为员工应用的生产后端。不得仅将 `KNOWLEDGE_HUB_DRIVER` 从 sqlite 改为 mysql 就认为历史知识已经迁移，也不得以新卷名替换旧卷。

先明确实际 SQLite 路径（包括旧 `storage/knowledge/lantern.sqlite` 或 `/data/knowledge/lantern.sqlite`），停止所有写入，使用 SQLite 一致 backup 保存资源、所有版本、发布状态、文件、关系与来源，并核对旧库内容。再制定并验收目标 MySQL 的数据迁移/导入；内置首次导入只提供仓库知识源，不能恢复历史人工维护资源、版本关系或全部文件。当前交付不提供自动跨驱动搬迁，未验证完整迁移之前不要切换既有业务库。

文件名兼容遵循 [命名迁移说明](lighthouse-naming-migration.md)：新文件不存在时可复用同目录旧文件，两者存在选择新并提示；固定内置 Skill 资源 ID 仍为 `lantern-knowledge-standardize`，避免重复资源。原 `lantern_*` / `lantern://` 只保留运维兼容别名，不扩大员工客户端权限。

Compose 要求明确选择已存在或已经初始化的数据卷，通过 shell 或 `--env-file` 设置 `LIGHTHOUSE_DATA_VOLUME`。已有部署可填原卷实际名称（包括历史 `lantern-knowledge`）；命名卷不能替代外部 MySQL 备份。首次创建卷后确认非 root 容器用户有必要写权限，上传存储的实际路径须在应用配置中指向持久存储。

```sh
# .env.runtime 是运维侧私有文件，不能提交或打包。
docker compose --env-file .env.runtime -f compose.hermit.deploy.yaml up -d
```

## 健康检查与打包

`GET /api/health/live` 是公开最小存活检查；`GET /api/health/ready` 核对有效配置、数据库连接和认证/知识 schema，未就绪返回无内部细节的 503。就绪 200 不代表真实平台角色、禁用员工或回调契约已经验收。健康检查使用 ready 且只接受直接 200；不跟随业务页、登录页或门户的重定向来判断就绪。

应用构建上下文排除真实 `.env`，DSH carrier 排除环境文件。内网 standalone 组装前还须审查最终文件清单，拒绝真实环境文件、密钥、开发机配置和运行数据库进入产物；只在运行时注入配置。维护 CLI 留在可信服务器运维交付中，员工只接收独立 employee client 包。静态资源、源码及知识材料已被公共仓库发布的历史事实不会因增加登录而变为私密；若需撤下已公开资料，须另行处理公开来源和历史传播。

## 回滚与外部发布条件

回滚前停止新应用写入，保留新旧数据库、上传文件及密钥。按迁移兼容性验证旧应用是否可使用当前 schema；不兼容时只能在隔离验证后恢复匹配的备份、旧应用和旧环境，并处理备份之后的数据。不要自动反向迁移、覆盖数据库、删除原卷或混用旧环境与新授权库。恢复旧应用意味着恢复其旧访问边界，不能把回滚当作绕过员工认证的正常部署方案。

正式发布仍要求平台确认：应用及精确角色语义；成功身份查询代表有效内部员工及停用/离职语义；角色变化传播延迟；card 固定入口、token 验证与本浏览器显式身份确认；callback/state/返回地址的绑定契约（仅启用 callback 时）；旧回调方案的单独批准（如需）；生产 MySQL 与代表性迁移样本；真实 HTTPS/反向代理、网络、日志中 token 脱敏和秘密保管。没有这些证据，保持未验收状态，不声称已经完成真实 IAM 对接或生产部署。

## 过期授权记录维护

`npm run auth:prune` 只统计已过期记录；运维确认后运行 `npm run auth:prune -- --apply`，每次最多删除 5,000 条已过期记录。可由部署方现有维护计划定期运行。授权审计保留 90 天；登录事务、会话、工具令牌分别以自己的绝对过期时间清理。刷新令牌的全部使用历史保留到整组授权到期，禁止按创建时间或 used 字段提前清除，以免丢失重放检测依据。

管理员上传与批量导入会在实际写入前再次检查身份、角色与 CSRF；批次中途撤权会停止后续条目，已提交条目保留各自审计记录。

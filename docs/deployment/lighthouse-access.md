# lighthouse 员工访问部署

关联 [GitHub Issue #48](https://github.com/KeithChen51/Lantern/issues/48)。本文描述应用部署契约，不代表门户平台、真实 MySQL、迁移或生产环境已经验收。

## 权限与客户端

所有业务浏览、知识读取、路引对话和附件访问要求门户验证的有效员工身份。有效员工即使角色列表为空仍可浏览；当前应用的指定角色提供 `knowledge:manage`，仅用于知识中台管理。灯塔仅保存必要的身份映射和授权状态，不在本地分配人员或角色，不自动继承最高管理员、Action、Workshop 或反馈提交权限。

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
| `PORTAL_API_BASE_URL` / `PORTAL_LOGIN_URL` | 已确认的 HTTPS API 基础地址与登录入口，不能包含内嵌凭证或 fragment |
| `PORTAL_APP_CODE` / `PORTAL_APP_SECRET` | 平台分配的当前应用标识和密钥；secret 仅在服务端运行时注入 |
| `PORTAL_KNOWLEDGE_ADMIN_ROLE` | 当前应用知识管理员的精确角色标识 |
| `AUTH_ENCRYPTION_KEY` | 专用随机 32 字节密钥的 base64 编码；与数据库备份一同受控保存，不能用示例值 |
| `PORTAL_EMPLOYEE_VALIDATION_CONFIRMED` | 平台确认身份查询成功表示当前有效内部员工后，才显式设置 `true` |
| `PORTAL_CALLBACK_PARAM` / `PORTAL_STATE_PARAM` / `PORTAL_TOKEN_PARAM` | 默认 `redirectUrl` / `state` / `token`；必须与平台回调契约相符，三者名称不能相同 |
| `PORTAL_ALLOW_LEGACY_CONFIRMATION` | 默认 `false`；仅在另行批准旧回调方案后开启显式身份确认，不能自动接受未绑定回调 |
| `AUTH_ALLOW_LOCAL_HTTP` | 部署时为 `false`；只有非 production 运行模式且 deployment=`development` 的 localhost、127.0.0.1 或 [::1] URL 可开启。不能用它实现内网测试 |
| `DATABASE_URL` | 生产必须配置 MySQL；无 SQLite 或本机空库自动回退 |
| `KNOWLEDGE_HUB_ENABLED` / `KNOWLEDGE_HUB_DRIVER` | 生产必须为 `true` / `mysql` |

可在安全的运维环境用 `openssl rand -base64 32` 生成加密密钥并直接存入秘密管理。丢失或更换该密钥会使已有加密的上游授权无法读取；换钥需要规划授权失效、重新登录及回滚，不要在每次容器启动时生成新钥。

共享管理员密码、旧 admin cookie 安全开关、预览身份与演示种子不再建立员工或知识管理员会话。生产不要运行演示用户种子来解决登录问题。有效员工与历史演示身份不会自动合并。

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

HTTP 测试 Cookie 保留 `HttpOnly; SameSite=Lax; Path=/`，不设置 Domain，省略 HTTP 无法使用的 `Secure` 和 `__Host-`；名称为 `lighthouse_test_<origin SHA-256 前16位>_session/login/pending`。不同测试 origin 使用不同名称，正式环境仍使用 `__Host-lighthouse_session/login/pending` 和 `Secure`。Cookie 本身不按端口隔离，独立名称不能替代部署隔离：测试与生产必须使用独立数据库、上传存储、门户应用配置和认证加密密钥，正式域名不能复用测试 HTTP 入口。HTTP 传输没有 TLS 保密性，测试入口只应在部署方控制的内网可达。

部署方另需提供表格中的 MySQL、知识中台、门户 HTTPS API/登录地址、应用编码/密钥、精确管理员角色、员工有效性确认和加密密钥。production 构建下的数据库检查不会因 `test` 标记跳过。同源写入仍精确匹配协议、IP 和端口，CSRF、登录事务/state 及安全回跳校验继续执行，不信任客户端的 Host/转发头来生成回跳地址。HTTPS 测试可省略 HTTP 例外，此时 Cookie 同样有独立测试名称并使用 Secure。

门户是否允许实际 HTTP IP 回调、从 HTTPS 门户返回 HTTP 时的行为、state 原样回传以及内网浏览器策略均待联调，配置例外不代表平台已许可。需在平台登记与配置完全一致的 `/auth/portal/callback`，通过普通员工和管理员完整登录、退出、撤权后才能验收。本次只适配网页登录入口；员工 CLI/MCP 继续只接受 HTTPS 服务 origin，不提供全局关闭 TLS 校验或 HTTP bearer 例外，不能用 HTTP 测试入口完成员工工具联调。

2026-10-13 本地验证：新增配置和 HTTP 登录链路共 38 项测试，使用真实认证服务/路由、合成门户及内存事务库，覆盖错误地址/端口、生产误开例外、Cookie 属性、会话、退出、CSRF、state 和回跳重放；全量 459 项通过，lint、TypeScript、production 构建通过。使用上述合成 HTTP 测试 origin 运行 production standalone，38 项匿名访问/静态文件/健康检查通过，数据库不可用时 ready 仍为 503。独立规格和质量审查通过；以上不替代真实门户、浏览器或 MySQL 验收。运行过程及环境限制见[验证记录](lighthouse-access-verification.md)。

## 会话与权限变化

Web 会话绝对上限 8 小时、闲置上限 60 分钟；Cookie 为 HttpOnly，HTTPS 使用 Secure，Cookie 写操作需要同源和 CSRF 校验。身份有效性缓存最多 5 分钟，角色缓存最多 5 分钟，知识管理写操作要求最近 1 分钟内验证权限；上游故障不能延长缓存新鲜度。角色服务故障在有效缓存过期后关闭管理权限，不把有效普通员工自动升级。

工具 access token 有效期 5 分钟，refresh token 轮换并拒绝重放，设备/客户端授权总时长不超过 8 小时及上游授权期限。每次请求检查本地吊销状态。Web 显式退出会吊销该登录授出的待确认/已确认工具授权；仅 Web 闲置超时不会自动吊销此前确认的工具。员工可在自己的工具授权列表撤销设备；没有本地管理员分配员工权限的入口。

## MySQL 部署顺序

1. 停止旧应用写入，记录应用提交、镜像、环境配置、加密密钥与现有数据库/上传存储位置；备份 MySQL、上传文件和原 SQLite 文件（如有），在隔离环境验证备份可读。
2. 使用与新应用相同版本的可信运维源码，注入目标 MySQL `DATABASE_URL`，执行 `npm ci --ignore-scripts`、`npm run db:generate`、`npm run db:deploy`。Prisma 迁移必须先于新应用启动。不要从员工工具包执行迁移。
3. 在维护窗口手动执行 `npm run hub:import-existing -- --publish`，首次导入内置已发布知识；运行前确认目标数据库。已有固定 ID 会跳过，不自动覆写管理员内容。不要在容器每次重启时自动导入、发布或迁移。
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

正式发布仍要求平台确认：应用与角色配置；成功身份查询代表有效内部员工及停用/离职语义；角色变化传播延迟；回调/state/返回地址的安全绑定契约；旧回调模式的单独批准（如需）；生产 MySQL 与代表性迁移样本；真实 HTTPS/反向代理、网络、日志中 token 脱敏和秘密保管。没有这些证据，保持未验收状态，不声称已经完成真实 IAM 对接或生产部署。

## 过期授权记录维护

`npm run auth:prune` 只统计已过期记录；运维确认后运行 `npm run auth:prune -- --apply`，每次最多删除 5,000 条已过期记录。可由部署方现有维护计划定期运行。授权审计保留 90 天；登录事务、会话、工具令牌分别以自己的绝对过期时间清理。刷新令牌的全部使用历史保留到整组授权到期，禁止按创建时间或 used 字段提前清除，以免丢失重放检测依据。

管理员上传与批量导入会在实际写入前再次检查身份、角色与 CSRF；批次中途撤权会停止后续条目，已提交条目保留各自审计记录。

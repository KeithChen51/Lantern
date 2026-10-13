# 独立生产与测试环境的执行流程

关联 [Issue #50](https://github.com/KeithChen51/Lantern/issues/50)；认证契约来自账号 PR #49 的 [员工访问部署](https://github.com/KeithChen51/Lantern/blob/fdbe98f66c78a3d3af16c39376e7f4b823cc67a2/docs/deployment/lighthouse-access.md)。两项改动完成集成后才能正式交付。本文是可执行的部署约定，实际内网数据库、门户回调、网关与恢复验收仍需回传证据。示例地址、目录和镜像均为占位或合成值。

## 交付、测试与生产的顺序

本机 `main` 是经评审的源码交付基线。内网使用 `dev` 测试分支与 `master` 生产分支，两者名称和职责不要混淆：

1. 本机形成交付版本，导出源码与 AI 更新指南，更新内网 `dev`。
2. `dev` 流水线重新构建应用和 operations 镜像。显式升级**现有 HTTP IP 测试栈**；保留现有数据库、卷和 HTTP 入口。验证登录、知识、路引、上传、版本/可见性/目录/回收站等状态保留。
3. 内网通过 `dev → master` PR 后，由 `master` 流水线**重新构建**应用与 operations 镜像。记录这次生产构建的 digest、完整提交和版本，不声称它与 dev 产物具有相同 digest。
4. 首次生产部署执行新库初始化和生产联调；后续执行备份、迁移、应用升级，不再初始化知识。生产重建产物也须做就绪和业务 smoke。

CI 形成镜像，不自动部署、初始化、备份或恢复。每个实际环境动作由运维显式执行。应用与 operations 必须来自同一提交和版本，所有执行使用固定 digest；脚本不自动拉取新 dev 标签。

进入生产前，测试验收应包含一次完整的升级与隔离恢复核验，并记录测试提交、镜像和结果。首次初始化的写入验证可以使用测试阶段另建的临时空库/空目录，不能清空既有测试栈来模拟。只有测试验收完成后才进入第 3 步；不要提前创建生产数据来代替测试验证。

## 数据边界与初始化清单

生产从空 MySQL 库开始，不复制测试库。首次创建四个文件夹：白皮书、参悟案例、行为准则、Skill。初始化共 22 个资源：

- 《精诚服务品牌升级：价值框架与路径》一份，稳定 ID `brand-whitepaper`。
- 《云游胖东来：标杆案例转译卡》一份，稳定 ID `knowledge-mirror-pang-dong-lai`。
- 当前正式的 18 个参悟案例，默认 `internal` 可见性。
- 资料标准化 Skill（稳定 ID `lantern-knowledge-standardize`）与 `case-insight` 案例参悟 Skill，包含各自引用文件。

行为准则暂不初始化独立条目。不导入 `brand-guide` 和 `knowledge-heart-values`，也不删除仓库来源或既有库里的同名资源。不建立演示品牌、门店、用户或测试会话。`inventory` 是不连接数据库的预览；`initialize` 只允许新建的空环境，数据库应用级检查还会拒绝任何既有数据。

普通升级只运行 `migrate`（Prisma migrate deploy）。没有 `db:setup`、`db:seed`、知识导入、自动发布或 Skill 替换。已有资料、文件、历史版本、发布指针、可见性、目录与删除状态归管理员维护；后续内容变更使用独立审核/导入流程。

## 新环境模板

模板目录：[environments](../../deploy/intranet/environments/)。新生产和新建的隔离测试使用同一个 compose，不允许拿新模板直接替换现有测试栈。

| 项目 | 生产 | 测试 |
| --- | --- | --- |
| 运行构建 | `NODE_ENV=production` | `NODE_ENV=production` |
| 对外入口 | 正式 HTTPS 域名，经既有 TLS 网关 | 现有 HTTP 内网 IPv4 与端口 |
| 持久化 | 独立 MySQL 和 app bind 目录 | 现有卷继续保留；新隔离栈才使用独立 bind 目录 |
| 数据库 | 独立库、用户、应用密码、root 密码 | 与生产不同的库、用户和密码 |
| 门户 | 独立应用编码/密钥与加密密钥 | 独立测试配置 |
| 网络 | 独立 database/runtime 网络，按需接网关 | 独立网络；MySQL 不发布宿主端口 |

`production.env.example` / `test.env.example` 是**控制文件**，包含数据库 root 密码等运维信息。`app.env.example` / `test-app.env.example` 是仅供应用的运行文件，不能包含 root 密码。compose 只给 MySQL 注入 root 密码，operations 只收到应用数据库连接。所有真实文件在内网创建，不提交、不随源码打包、不在日志输出。使用独立私密配置目录（0700）和文件（0600）。应用需要访问内网模型，因此 runtime 网络允许出站，database 网络仅供数据库通信。

控制文件接受 `KEY=value` 或 `KEY='字面值'`，一行一个变量；不接受 `export`、双引号、插值、命令替换、多行值或行尾注释。脚本不 `source`/`eval` 文件。特殊密码用单引号，并对 `DATABASE_URL` 用户名/密码进行 URL 编码，不能放 root 账号。为避免错误路径操作，数据/备份根目录必须绝对、规范、相互独立，不能含 symlink、`.` 或 `..`；部署方选服务器的大容量 `/data` 文件系统。

新目录由显式 `prepare` 创建，MySQL 与应用分别挂载 `${DATA_ROOT}/mysql`、`${DATA_ROOT}/app`。准备只接受空目录和没有容器的 project，并通过工具镜像的 root 用户给**新建的空 app 目录**设置 UID/GID（默认 node 1000:1000）。不会递归修改旧环境目录或改变 Docker daemon data-root。恢复验证只对新隔离目标做权限恢复。默认资源上限 app 1536 MiB、MySQL 1 GiB、operations 1 GiB，可按真实压测修改；这些限额不代表单机容量已验收。

## 门户与 HTTP 测试契约

生产应用运行配置必须为 `AUTH_MODE=portal`、`LIGHTHOUSE_DEPLOYMENT_ENV=production`、HTTPS `LIGHTHOUSE_ORIGIN`，`AUTH_TEST_HTTP_ORIGIN` 为空。新 compose 从控制文件的 `ENVIRONMENT` 注入部署标记。

现有测试用 `test-app.env.example` 的字段，仍保持原 IP 和端口：

```dotenv
NODE_ENV=production
LIGHTHOUSE_DEPLOYMENT_ENV=test
AUTH_MODE=portal
LIGHTHOUSE_ORIGIN=http://10.20.30.40:18081
AUTH_TEST_HTTP_ORIGIN=http://10.20.30.40:18081
AUTH_ALLOW_LOCAL_HTTP=false
```

两个 origin 必须逐字一致、无尾斜线/路径；只允许规范 RFC1918 IPv4。这里的 IP/端口是合成示例，填写当前测试入口。门户 API/登录仍须 HTTPS，回调地址按该测试 origin 的 `/auth/portal/callback` 登记。门户是否接受真实 HTTP 回调、state 回传与内网浏览器行为必须实际验证。HTTP 例外仅用于网页登录与业务联调，员工 CLI/MCP 继续只允许 HTTPS。

生产与测试使用不同门户应用及 32 字节 base64 的 `AUTH_ENCRYPTION_KEY`。普通升级禁止悄悄换钥；脚本比较旧容器与新配置里的密钥，不一致就拒绝。备份额外保存旧容器实际环境，避免运维修改文件后丢掉旧钥。`PORTAL_EMPLOYEE_VALIDATION_CONFIRMED=true` 只能在平台明确有效员工语义后配置。不要通过旧共享密码、`ADMIN_COOKIE_SECURE` 或 development 构建绕过新登录方案。

## 新生产：准备、预览、首次初始化

以下文件都来自同一已交付源码；实际目录可调整。真实地址/密钥由内网运维填写，下面不会自动修改既有测试：

```bash
SOURCE=/opt/lighthouse-source
CONTROL=/data/lighthouse-config/production.env

# 复制模板并填写；控制文件和 app 文件都 chmod 600。
# 明确拉取 master 构建的应用/operations digest 和经确认的 MySQL digest：
docker pull registry.example/lighthouse@sha256:APP_DIGEST
docker pull registry.example/lighthouse-tools@sha256:TOOLS_DIGEST
docker pull registry.example/mysql@sha256:MYSQL_DIGEST

bash "$SOURCE/scripts/intranet/environment/environment.sh" verify "$CONTROL"
bash "$SOURCE/scripts/intranet/environment/environment.sh" inventory "$CONTROL"
bash "$SOURCE/scripts/intranet/environment/environment.sh" prepare "$CONTROL"
bash "$SOURCE/scripts/intranet/environment/environment.sh" initialize "$CONTROL"
```

digest 占位必须换成完整 64 位 SHA-256。`verify` 核对本地 OCI revision/version 和工具镜像离线自检；`inventory` 核对精确 22 资源；初始化依次启动 MySQL、迁移、一次性导入，再启动应用。服务 healthcheck 和最后核查只接受 `/api/health/ready` 的**直接 200**，不跟随跳转。任何失败都返回非零，不自动清库或删除文件。若已导入但门户配置使 ready 失败，修好配置后走升级/重启流程，不能重新运行首次初始化。

production 模板只发布 loopback HTTP 端口；网关 override 挂接已有外部网络，并给 app 明确的独立 DNS alias。在私密控制文件填写 `GATEWAY_ENABLED=true`、实际 network 和唯一 alias。修改 `gateway.conf.example` 的正式域名/alias，检查已有 `$connection_upgrade` map，执行 **nginx -t 成功后再 reload**。TLS 在既有 LB/WAF 终止，此专用生产 vhost 明确设置 forwarded proto=https；真实客户端 IP 只信任已核实的 LB/WAF 地址。所有 proxy header 同在 location，避免 Nginx 继承规则遗漏 Host/协议。动态 Docker DNS 避免应用重建后 proxy 继续使用旧 IP；关 buffering 支持路引流式响应。

## 已有 HTTP 测试栈：保持原卷升级

使用 [existing-test.sh](../../scripts/intranet/environment/existing-test.sh)，不能对旧测试运行新环境的 `prepare` 或 `initialize`。它要求 Bash、Docker Compose 与 GNU coreutils（readlink、tar、gzip、sha256sum、find、sort、xargs）；无需宿主 Node/jq。compose 中应用服务继续使用 `${LH_IMAGE}` 作为镜像变量。

1. 在原私密配置里补齐 accepted HTTP 门户字段，保留现有 `DATABASE_URL`、MySQL 库/账号/密码、project、端口和所有挂载。建议将应用运行变量移到单独私密 env_file，避免旧 app env_file 向应用注入控制文件的 root 密码；这只是配置隔离，不搬迁卷。旧加密密钥已经存在时必须保持原值。
2. 记录实际 app/MySQL service 名和现有 network，拉取 dev 构建的固定 app/tools digest。确认 MySQL 不做本次升级。运行：

```bash
SOURCE=/opt/lighthouse-source
COMPOSE=/data/current-test-config/compose.yaml
CONTROL=/data/current-test-config/control.env
PROJECT=current-test-project
BACKUPS=/data/lighthouse-backups/current-test
APP=registry.example/lighthouse@sha256:DEV_APP_DIGEST
TOOLS=registry.example/lighthouse-tools@sha256:DEV_TOOLS_DIGEST
NETWORK=current-test-project_app

# app/mysql 名省略时分别为 lighthouse/mysql；必要时在末尾显式指定。
bash "$SOURCE/scripts/intranet/environment/existing-test.sh" upgrade \
  "$COMPOSE" "$CONTROL" "$PROJECT" "$BACKUPS" "$APP" "$TOOLS" "$NETWORK"
```

脚本保存实际容器 inspect、原 compose、私密配置与挂载标识；停 app 写入，dump MySQL，并通过 `--volumes-from 原app:ro` 保存原 `/data`（含匿名卷、上传与旧 SQLite 文件）。已确认备份和校验后，同版本 tools 镜像接入**现有 network**只执行 migrate，然后更新原控制文件的 `LH_IMAGE`，执行 `compose up -d --no-deps --pull never lighthouse`。没有 `--renew-anon-volumes`、`down -v` 或旧 migrate 服务；不会运行 db:setup/seed/import。

新 app 实际 image ID、`/data` mount type/name/source、MySQL 容器 ID 必须符合记录；出现差异则停新 app 供调查。继续验证直接 ready 200、HTTP 入口和业务内容。失败备份会恢复原 app 的运行状态；迁移失败则 app 保持停止，保留备份等待诊断，不做自动回滚。不要启用 `set -x`；原容器 inspect/环境/数据库含秘密，仅保存在私密备份目录。

## 升级、每日备份与 14 天保留

新生产每次升级前，把私密控制文件的 app/tools digest 改为**本次 master 构建的一致 pair**，显式拉取；MySQL digest 与原服务保持一致。保留原 `DATABASE_URL` 和运行文件的加密密钥；脚本在停应用前与旧容器实际值核对，任何数据库连接变化均拒绝。数据库搬迁或凭证轮换需另行制定流程。执行：

```bash
bash "$SOURCE/scripts/intranet/environment/environment.sh" upgrade "$CONTROL"
# 日常只备份；恢复 app 原来的运行/停止状态：
bash "$SOURCE/scripts/intranet/environment/environment.sh" backup "$CONTROL"
```

升级：匹配镜像 → 停 app 写入 → 完整备份及校验成功 → migrate → 启动新 app → ready200。备份期间短暂停写确保 DB 与附件一致，禁止同时运行管理写入或另一个运维流程。每个环境必须只有一份控制文件；锁放在其旁，复制控制文件并发运行会绕过锁，运维不能这样操作。迁移成功后不会做知识重导。失败不删除原数据，不自动逆向迁移 schema。

备份包含逻辑 SQL、全部持久 app 文件、文件摘要、控制配置、应用运行配置、**原容器实际配置与加密密钥**、新目标及原 app image ID/版本提交、MySQL/tools ID 和全包校验。备份目录 chmod700，文件遵循 umask077。`.incomplete` 不属于成功备份，失败时保留供检查。只有自己的 completed 备份直系目录、已知文件组成、超过 14 天才被清理；不递归删除目录，失败的新备份不触发旧备份清理。

由内网现有 scheduler 每日运行 backup；示例 Linux cron（先替换绝对路径并人工试跑）：

```cron
20 2 * * * /bin/bash /opt/lighthouse-source/scripts/intranet/environment/environment.sh backup /data/lighthouse-config/production.env >> /data/lighthouse-private-logs/backup.log 2>&1
```

现有测试可每日使用 `existing-test.sh backup`，其余参数与升级相同。首次配置日志目录为0700、日志0600，配置独立日志轮转。此处只提供配置，不创建计划任务。数据库/inspect 不打印到日志。备份全部在同一服务器；无法恢复整机或备份盘损坏，当前没有额外备份服务器。

## 隔离恢复验证

上线前选择 completed 备份，创建**新的**私密恢复控制文件：`ENVIRONMENT=restore`、不同 project、不同数据库/账号、**不存在或完全空的目标 DATA_ROOT**、`GATEWAY_ENABLED=false`、原 BACKUP_ROOT，以及 manifest 中 recorded 验证 app/tools 与 MySQL 对应的精确镜像 digest（image ID 必须一致）。`APP_ENV_FILE` 指向私密应用文件，但恢复不会启动应用或开放业务端点。

```bash
bash "$SOURCE/scripts/intranet/environment/environment.sh" restore-verify \
  /data/lighthouse-config/restore.env \
  /data/lighthouse-backups/production/COMPLETED_BACKUP_NAME
```

同一命令可验证 existing-test.sh 的 completed 备份；额外先在该备份目录执行 `sha256sum --check --status RECOVERY-SHA256SUMS`，核对旧 compose/额外恢复配置。脚本校验包、拒绝原 project/数据库/目录，准备隔离 MySQL，恢复 SQL/app 文件，比较全部文件摘要及重新 dump 的完整逻辑 SQL；保存原 app.env/control/container-inspect 到新目录下的私密 `recovery`。不执行 migrate、initialize、app启动或公网 callback。目标已经使用过就拒绝，不能以“验证恢复”为由覆盖原环境。

SQL 比较仅允许一种已验证的等价写法：MySQL 恢复后在字符字段的相同 `utf8mb4` 排序规则前补写 `CHARACTER SET utf8mb4`。比较器只在 `CREATE TABLE` 的字符列定义前缀中统一这一写法，保留其余 SQL 字节；行数据、默认值、注释、排序规则、索引或其他结构变化仍会失败。比较器随 `scripts/intranet/environment/` 交付，通过已选定的 tools 镜像断网、只读执行，不要求服务器另装 Node，也不会修改备份。

验证 SQL/文件一致覆盖历史资料、版本、发布、可见性、目录、回收站、授权密文等持久状态，但不替代真实门户解密/登录验收。恢复正式服务需从旧实际环境恢复匹配加密密钥，人工评估 schema 与旧 app 兼容性、处理备份后新增数据，再制定切换；禁止直接覆盖生产或测试。隔离验证完成后，可人工 `compose stop mysql` 保留验证数据；另行决定是否清理。本文和脚本不自动删库、删卷或自动回滚。

## 必须回传的验收结果

- dev 与 master 各自提交、版本、app/tools digest 和 OCI labels；原/新测试挂载与 MySQL 容器 ID。
- 普通员工（空角色也可）、知识管理员登录退出、撤权和管理员降权；实际 HTTP 回调与生产 HTTPS 网关。
- 初次生产 22 资源/四文件夹；没有演示身份；已有知识新增/编辑/移动/删除后升级，历史版本/文件/状态仍一致。
- 路引模型、上传、流式响应及直接 ready 200；生产重建产物的业务 smoke。
- completed 备份与隔离恢复的 SQL/文件比对、私密恢复配置/密钥保存情况；仅回传脱敏结果，不能把配置、dump 或员工样本放进公共报告。

本机 fake Docker 测试验证命令顺序和拒绝行为，不能证明真实 MySQL 迁移/备份/恢复、门户或 Nginx 已成功。没有 Docker daemon 时需准确记录环境限制，不标记内网验收通过。

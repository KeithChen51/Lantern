# 访客生产与 IAM 测试的部署和切换

关联 [Issue #60](https://github.com/KeithChen51/Lantern/issues/60)。本功能在同一个 production 构建中，通过运行时 `AUTH_MODE` 显式选择 `guest`、`iam` 或保留的 `portal` 兼容模式。生产可以先使用访客，测试继续联调 IAM；IAM 未配置、配置错误或服务不可用均不得自动降级为访客。本文不表示已修改内网服务器或完成真实 IAM 联调。

## 环境配置

| 项目 | 生产访客 | 测试员工 |
| --- | --- | --- |
| 应用镜像 | 固定 `registry.example/lighthouse@sha256:<APP_DIGEST>` | 完全相同的应用 digest |
| 运维镜像 | 固定同提交/版本的 `lighthouse-tools@sha256:<TOOLS_DIGEST>` | 完全相同的 tools digest |
| 构建模式 | `NODE_ENV=production` | `NODE_ENV=production` |
| 部署标记 | `LIGHTHOUSE_DEPLOYMENT_ENV=production` | `LIGHTHOUSE_DEPLOYMENT_ENV=test` |
| 访问模式 | `AUTH_MODE=guest` | `AUTH_MODE=iam`，显式选择 source；本轮 `IAM_AUTHORIZATION_SOURCE=portal` 组合模式 |
| 对外入口 | `https://lighthouse.example.invalid` | 独立 HTTPS origin；或原有精确 RFC1918 IPv4 HTTP 测试例外 |
| 数据 | 独立数据库、数据库账号、app 上传挂载、备份根目录 | 保留测试原有数据库与挂载，绝不挂生产目录 |
| 本地密钥 | 独立且稳定的 `AUTH_ENCRYPTION_KEY` | 独立且稳定的另一把本地密钥 |
| 会话 | 生产访客命名空间 | 测试 origin 对应的员工命名空间，禁止跨环境复用 Cookie |

两个镜像仓库各有自己的 digest，不能把 app digest 填进 tools。按构建清单和 OCI `revision` / `version` 核对配对。既有 dev/master 流水线分别构建，并不保证摘要相同；同镜像对照验收应选定同一份已验证的 app/tools 产物，在两套隔离环境显式固定这些 digest。本功能不改变流水线或分支晋级约定。

模板位于 [deploy/intranet/environments](../../deploy/intranet/environments/)：生产控制文件复制 `production.env.example`，其 `APP_ENV_FILE` 指向私密 `production-app.env`；该应用文件由 `guest-app.env.example` 填写。测试继续使用 `test.env.example` 和 `test-app.env.example`，后者已显式选择 IAM 登录 + 中台角色；已有测试栈保留原 compose、project、数据库和挂载。`app.env.example` 保留原 IAM sync 模式，`iam-portal-app.env.example` 是组合模式 HTTPS 员工模板。模板不会自动切换现网，详见[组合模式配置与验收](lighthouse-iam-portal.md)。

访客必需配置示例：

```dotenv
NODE_ENV=production
LIGHTHOUSE_DEPLOYMENT_ENV=production
AUTH_MODE=guest
LIGHTHOUSE_ORIGIN=https://lighthouse.example.invalid
AUTH_TEST_HTTP_ORIGIN=
AUTH_ALLOW_LOCAL_HTTP=false
AUTH_ENCRYPTION_KEY=REPLACE_WITH_PRIVATE_BASE64_32_BYTE_KEY
KNOWLEDGE_HUB_ENABLED=true
KNOWLEDGE_HUB_DRIVER=mysql
DATABASE_URL=mysql://APPLICATION_USER:URL_ENCODED_PASSWORD@mysql:3306/ENVIRONMENT_DATABASE
```

Compose 从控制文件注入后三项数据库/知识配置；不要把 root 密码放进应用文件。访客无需 `IAM_*`、`PORTAL_*` 凭据，仍需稳定的随机 Base64 32 字节本地密钥、可用的 MySQL、DSH 运行时与模型配置。可在受控终端用 `openssl rand -base64 32` 首次生成本地密钥，保存到该环境的私密配置与备份；生成输出是秘密，不得粘贴到公开 Issue、日志或源码。已有环境必须保留原钥，不能每次启动生成，不能拷贝另一环境的钥。应用配置目录权限 0700、文件 0600，按现有私密配置规则管理。

生产只接受 HTTPS。两种模式的测试都使用 production 构建，HTTP 例外仍必须同时设置 `LIGHTHOUSE_DEPLOYMENT_ENV=test`、逐字相同且无路径/尾斜线的 `LIGHTHOUSE_ORIGIN` 与 `AUTH_TEST_HTTP_ORIGIN`，并且地址为规范 RFC1918 IPv4。`AUTH_ALLOW_LOCAL_HTTP=false`；不能使用 development 构建、公网 HTTP 或放宽 origin 来绕过校验。本轮已确认 HTTP 测试入口为 `http://10.0.147.68:16888`。IAM 服务端和员工 CLI/MCP 继续遵循其 HTTPS 契约。

## 访客可见范围

访客只能读取已发布且可见性为 `public` 的知识资料；`internal`、`private`、草稿、归档资料及受限历史版本仍不开放。相同限制覆盖页面、搜索、下载、路引检索与引用，不会因启用访客模式批量改写资料可见性。需要对访客展示的资料应在有权限的管理环境逐项审核并发布；员工模式继续遵循原权限。

访客有独立的服务端会话与 CSRF 校验。默认每分钟每会话最多 20 次对话、10 次附件上传，同部署分别最多 300 次、120 次；新访客会话最多每部署每分钟 120 次。部署总额度可能被单一来源消耗，网关应配合来源限流；应用额度不代替网关流量治理。

## 已有环境升级及显式切换

1. 先核对真实内网临时访客补丁的完整 diff、旧提交/镜像、实际 compose、数据库和挂载；补丁尚未回传时将这一项保留为上线前依赖。正式实现不能假定临时补丁的行为或直接覆盖未知改动。
2. 记录旧 app/tools digest、版本、完整提交和实际容器配置。按[既有部署流程](production-environments.md)保留 completed 数据库与 `/data` 文件备份，并验证校验清单；备份必须包含旧实际环境和稳定本地密钥。确认隔离恢复演练可用。
3. 填写目标模式的私密应用配置与固定镜像摘要。在同一环境切换时，保留其数据库连接、挂载和 `AUTH_ENCRYPTION_KEY`。从访客切回 IAM 前必须补全 IAM 登录、网络与回调登记；source=portal 另需独立中台凭据及已知角色，source=sync 另需同步配置和账号角色同步。不得保留缺项等待失败后回退访客。
4. 使用匹配的 tools 镜像执行 `migrate`，即 `prisma migrate deploy`。本次仅给 `chat_sessions` 增加可空 `guest_id` 及其索引，历史员工行保持 NULL；无需数据重置、知识导入或历史归属转换。不得运行 `db:setup`、seed、`initialize`、`hub:bootstrap` 或 `hub:import-existing`。首次全新空环境的初始化仍按原部署流程单独决定，不能当作模式切换步骤。
5. 显式重建应用容器以加载 env；单纯 `docker restart` 不会读取修改后的 env 文件。新模板环境使用下列 `upgrade`，它在停机前校验解析后的配置，备份后迁移并重建应用。已有测试用 `existing-test.sh upgrade` 保留原数据库容器和匿名 `/data` 卷，参数及备份规则沿用[部署流程](production-environments.md)，不能拿新 compose 替换。

```bash
SOURCE=/opt/lighthouse-source
CONTROL=/data/lighthouse-config/production.env
# 已在私密文件设置 AUTH_MODE=guest 和确认过的 image digest。
bash "$SOURCE/scripts/intranet/environment/environment.sh" verify "$CONTROL"
bash "$SOURCE/scripts/intranet/environment/environment.sh" upgrade "$CONTROL"
```

若不使用封装脚本，必须执行同等的配置预检、停写备份、tools `migrate`、使用原 project/compose/控制文件的 `compose up -d --no-deps --force-recreate`，再核对原挂载与数据库容器；不要把缺少这些保护的裸命令当作完整升级。验收 ready 必须是 `/api/health/ready` 直接 200，不能跟随登录跳转。ready 校验站点模式及访问记录、知识版本、访客对话列可查询；这不能代替模型连通性或业务验收。

模式切换不会自动把匿名历史合并到员工账号。访客 Cookie 与员工凭据隔离，切到 IAM 后原匿名凭据不能用于员工接口；切回访客也不把员工历史交给匿名浏览器。访客对话和临时附件依服务器签发的浏览器会话隔离；清理 Cookie、会话失效或密钥丢失后，浏览器失去原访客历史的访问能力，没有员工账号恢复或自动认领入口。不要通过复制 Cookie 在浏览器之间迁移身份。

## 回滚

准备回滚时保留 completed 备份、旧实际 env/密钥、旧 image digest 和新增期间的数据。恢复旧兼容镜像及其受支持的显式认证配置，然后重建应用，重新检查 ready 和业务流程。旧版本若不支持 `AUTH_MODE=guest`，必须恢复其完整 IAM/portal 配置；保留 guest env 会按配置错误拒绝启动，不能以自动回退解决。

`guest_id` 是新增可空列，旧镜像可忽略该列，不需要删除列或回滚迁移。保留索引和新产生的匿名数据；不得直接恢复旧 SQL 覆盖新增数据、删卷或重新初始化知识。若真实数据库出现本次以外的 schema/数据变化，先评估旧镜像兼容性和增量数据，再使用独立环境验证恢复；本流程不自动进行破坏性回滚。

## 验收与证据

- 同一个 app digest，在没有任何 IAM/portal 凭据的生产访客配置下 ready 直接 200；页面及已公开发布内容读取正常，路引 AI 可流式响应、上传允许的临时附件。搜索、下载及 AI 引用均不得返回 internal/private 资料或草稿。记录两环境 app/tools digest、版本/提交以及各自数据库/挂载隔离的脱敏证据。
- 两个独立浏览器 A/B 分别创建访客对话和附件，交叉引用对方的对话 ID、附件 ID 均被拒绝；对 A 清理 Cookie 后不能恢复旧历史。伪造、篡改、过期凭据均拒绝；跨源写请求、错误或缺失 CSRF 凭据不能成功。模型失败、超限请求和不支持的附件应明确失败，不能泄漏另一会话内容。
- 访客不能访问知识管理写接口、员工 CLI/MCP 授权或 IAM 同步接口，也不能获得员工身份资料。我的页面显示访客及版本消息；管理员身份不能由匿名 Cookie 推导。
- 同一浏览器先访客再切 IAM，匿名 Cookie/对话/附件不被当作员工凭据或合并历史；员工登录后按原权限验收，切回访客仍不暴露员工历史。模式切换前后知识资源、历史版本、附件、目录、可见性和删除状态保持一致。
- IAM 配置缺项/错误、未知或缺失 `AUTH_MODE`、缺失/非法本地密钥、错误 origin、生产 HTTP、错误数据库/知识驱动均应在预检或 ready 失败。禁止捕获配置错误后开放访客；现有 IAM/portal 严格拒绝测试继续通过。
- 保存本地测试、lint、TypeScript 和 production build 的实际结果。真实内网 IAM 注册、回调、所选授权来源的三角色与撤权、两环境数据库迁移、模型网关、上传和浏览器联调仍需内网验收；sync 模式另验同步。组合模式的 role-query 不检查中台账号状态，不能声称停用实时失效。本地模拟不等同于这些结果已通过，只回传脱敏证据。

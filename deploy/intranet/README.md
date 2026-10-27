# 内网测试先行、生产独立构建

关联 Issue #50。应用和运维镜像从同一个提交构建，生产与测试分别保留自己的数据库、上传目录和配置。初始化与升级是独立操作。

## 生产访客与测试 IAM

关联 [Issue #60](https://github.com/KeithChen51/Lantern/issues/60)。同一个 production 应用镜像可在运行时显式选择 `AUTH_MODE=guest` 或 `iam`；生产访客使用新增 `environments/guest-app.env.example`，IAM 测试继续使用 `environments/test-app.env.example`。保留现有 `app.env.example` 的 IAM 默认值。完整的密钥、数据库隔离、迁移、容器重建、切回 IAM 与回滚步骤见[访客部署说明](../../docs/deployment/lighthouse-guest-mode.md)。IAM 配置错误或服务故障不会自动开放访客访问。

验证“同一镜像”时，两套控制文件填写完全相同的应用 digest，并填写与其提交/版本匹配的同一个 tools digest；应用与 tools 属于两个仓库，各有自己的 digest。两套环境的数据库、上传挂载、本地密钥和 origin 必须独立。下文既有 dev/master 任务仍会分别构建，不保证重建后的 digest 相同；不得将“同一源码”写成已经证明“同一镜像”。本次模式支持不修改 Jenkins 分支或发布流程。

## IAM 直连接入

测试模板使用 `AUTH_MODE=iam`、`IAM_AUTHORIZATION_SOURCE=portal`，按 [IAM 登录 + 中台角色配置说明](../../docs/deployment/lighthouse-iam-portal.md)填写两套独立凭据，无需灯塔接收 IAM 账号/权限同步。原 `app.env.example` 保留 `source=sync`，该模式才要求 [IAM 同步配置](../../docs/deployment/lighthouse-iam-direct.md)及本地账号角色投影。中台卡片可导航 `/auth/iam/start`。旧运行环境不会自动切换认证：先完成 IAM 注册和网络、备份，再按原测试升级路径切换，测试通过后再评估正式环境。保留显式 `portal` 兼容模式供受控回退，不自动降级。

## 部署顺序

1. 本机完成开发、验证并形成 main 交付包后，更新内网代码平台的 dev 分支。
2. dev 流水线构建应用及运维镜像，在现有 HTTP 内网 IP 测试入口部署、联调。账号模块必须使用其约定的 test HTTP 配置。
3. 测试通过后，内网提交 dev → master 的 PR。master 流水线重新构建生产用镜像，归档该次构建的提交、版本和两个镜像摘要。
4. 首次生产部署显式执行迁移、预览与空库初始化，再通过正式 HTTPS 入口联调。
5. 后续功能仍先在 dev 测试，通过 PR 到 master 后构建生产镜像；生产升级只执行必要迁移，保留已有知识、版本、附件、目录与删除状态。

本机 main 与内网 master 是不同仓库的交付/生产基线。流水线不部署容器，不迁移数据库，不运行 demo seed，也不自动导入知识。环境脚本与验收步骤见 [生产与测试部署](../../docs/deployment/production-environments.md)。

本改造依赖账号 [PR #49](https://github.com/KeithChen51/Lantern/pull/49) 的认证、迁移与 `/api/health/ready`。正式交付必须先完成两项改动的集成验证：保留 production 构建、HTTP 测试的精确 origin 例外及 HTTPS 生产配置；健康检查只接受直接 200。不能单独把本开发分支当作 main 交付包。当前本地证据和内网待验收项见 [验证记录](../../docs/deployment/production-deployment-verification.md)。

## 一个构建计划自动识别 dev / master

CODING 构建计划使用根目录 `Jenkinsfile`，将推送触发分支配置为 `dev` 和 `master`。`LIGHTHOUSE_BUILD_BRANCH` 不填、留空或设为 `auto` 时，流水线在检出前读取触发分支；合并 dev → master 后，由 **master 推送事件**构建生产镜像。不要用合并请求创建/更新事件代替合并后的 master 构建。

**已有计划需调整一次**：删除固定的 `LIGHTHOUSE_BUILD_BRANCH=dev/master` 默认值，或将其改成 `auto`，并同步更新 dev、master 中的 Jenkinsfile。以后无需每次手工切换参数。保留现有代码仓库凭据和镜像仓库凭据。

| 任务 | 参数 | 产物标签 |
| --- | --- | --- |
| dev 推送 / 手动选择 dev | `auto`（默认） | `dev-<12 位提交号>-<构建批次号>`；兼容别名 `dev` |
| master 推送 / 手动选择 master | `auto`（默认） | `master-<12 位提交号>-<构建批次号>`；别名 `master` |
| 保留两个独立计划 / 手动指定 | 显式 `dev` 或 `master` | 按指定分支生成相应标签 |

自动识别采用 CODING 的 `GIT_BRANCH`，兼容 `BRANCH_NAME` / `GIT_LOCAL_BRANCH`；这些字段同时存在时必须一致。接受裸分支名以及 `origin/`、`refs/heads/`、`refs/remotes/origin/` 形式，仅允许 dev、master。字段缺失、值不支持或相互冲突会停止，不默认猜测 dev；`GIT_BUILD_REF` 可能只是提交 SHA，不能用来推断分支。字段定义见 [CODING 内置环境变量](https://coding.net/help/docs/ci/configuration/env.html)。

合并请求或标签构建即使显式指定分支也会拒绝发布。检出的 HEAD 仍必须等于本次实际拉取的 `origin/dev` 或 `origin/master`；配置错误会停止。SCM 回退 `checkout scm` 时必须由计划检出对应触发分支，不能固定为 dev。日志中的 `Selected build branch`、`Verified source commit` 和归档清单应互相对应。

| 参数 | 用途 |
| --- | --- |
| `GIT_REPO_URL` / `CREDENTIALS_ID` | 内网仓库 URL 与原代码凭证；也可使用任务 SCM 配置 |
| `CODING_DOCKER_CREDENTIAL_ID` | 现有镜像仓库用户名/密码凭证 ID |
| `NODE_IMAGE` | 已验证的内部 Node 24 Linux x64 基础镜像，建议配置固定摘要 |
| `NPM_REGISTRY` | 内网 npm 镜像源；仅构建期安装依赖 |
| `REG_HOST` / `REG_PROJECT` / `REG_REPO` | 内部镜像仓库位置；沿用现有默认值 |

应用仓库名为 `lighthouse`，运维仓库名为 `lighthouse-tools`。两个镜像的 OCI `revision` 标签为完整 Git SHA，`version` 为 package.json 版本。`BUILD_NUMBER` 必须为正整数，同一提交重跑使用新批次标签，前一批次部分推送失败不会占用后一批次的标签。已有批次标签一律拒绝覆盖，无法确认远端不存在时也停止发布；镜像仓库也应启用不可变批次标签策略。别名可以更新，部署记录应固定 `build-manifest.json` 中的 `repository@sha256:...`。同一分支使用一个固定构建任务；新建/重置任务编号时需确保不复用已有批次标签。

`build-manifest.json` 归档分支、构建批次号、完整提交、应用版本、应用与运维镜像标签及实际推送的仓库摘要；`build-image.txt` 保留两个摘要。它们证明构建身份，业务联调仍需在目标环境完成。

## 构建与离线验证

构建容器运行 npm ci --ignore-scripts --include=dev、离线 Prisma 生成、真实 DSH smoke、项目 build 与知识 CLI 打包。不要改成 npm install 或在内网修改锁文件。

Git 检出及提交核对发生在 Jenkins 宿主。打包器要求传入已核对的完整 `BUILD_REVISION`，不在 Node slim 容器中调用 Git；缺失或格式错误会停止打包。

应用 Dockerfile 只组装 standalone、CLI 和系统依赖。运维镜像单独携带本次 CI 安装的 Linux 依赖、Prisma 6.19.3 CLI、生成客户端、随包 query/schema 引擎、schema/migrations 和初始化内容。运维镜像仅用于受控服务器操作，不提供给员工终端。镜像运行时不安装依赖、不下载 Prisma 引擎。

流水线使用 `--network none` 验证应用 Linux DSH/SQLite，并验证运维镜像的完整提交与版本、Prisma 包及原生引擎版本、22 项只读初始化预览。CI 保留既有 `seccomp=unconfined`、`pids-limit -1`、`memory 4g` 线程兼容参数；这不意味着运行环境必须使用同样的权限。

## 运维镜像命令

默认命令只显示帮助；未知命令及多余参数返回错误。

| 命令 | 行为 |
| --- | --- |
| `verify` | 离线校验工具和初始资源清单，不连接数据库 |
| `inventory` | 输出初始化预览，不连接数据库 |
| `migrate` | 使用运行时 MySQL DATABASE_URL 执行 Prisma migrate deploy |
| `initialize` | 显式空库初始化；已有资源/目录/审计数据时拒绝，事务失败回滚 |

初始化内容为 1 份品牌白皮书、1 份标杆转译资料、18 个参悟案例和 2 个 Skill，共 22 项；行为准则文件夹初始为空。升级不得调用 `initialize`、`hub:bootstrap` 或 `db:setup`。旧通用 import CLI 保留给独立的人工内容流程，不是发布升级入口。

镜像支持离线运行，但构建仍需可用的内部 npm 源与基础镜像。离线依赖 manifest 中的 applicationCommit 只是原始提取来源；本次构建身份以 OCI 标签及流水线归档为准。

## 本机验证与内网验收

执行 `node --test scripts/intranet/branch-selection.test.mjs scripts/intranet/operations.test.mjs`，覆盖自动分支选择、手动覆盖、MR/标签拒绝、真实打包预览、固定命令分派、失败停止和 Git 分支守卫。Linux CI 内执行真正的运维 `verify`。当本机 Docker daemon 不可用时，不将本机预览测试当作 Linux 镜像或数据库部署验证；保留流水线完整日志和构建清单回传。

切换自动识别后，在内网分别验证 dev 推送、dev 合并 master 后的 master 推送、手动选择 master；核对所选分支、完整提交号、应用/tools 配对标签与归档摘要。自动构建只生成镜像，部署仍按测试先行、生产后评估的顺序执行。

# 上传 Gitee dev 后由流水线构建

关联：GitHub Issue #22。本次整合 PR #19 的运行包与当前 dev 的知识管理、标准化 Skill 和版本通知。流水线仍只发布 dev 测试镜像；合入 main 不自动部署生产。

## 交付步骤

1. 在内网 Gitee 仓库的 dev 工作副本中，将本包根目录内容复制到仓库根目录（Jenkinsfile 与 package.json 同级），检查差异后提交到 dev。不要把压缩包本身作为源码上传，不要把它套在 source/ 等新目录下。
2. 务必提交整个 deploy/offline/：包含 Linux DSH、Prisma 引擎和 OpenSSL。本包没有 .git，不改变仓库 remote；不要替换内网凭证和已有运行环境文件。
3. 现有流水线源码分支选 dev，流水线定义改为“仓库内 Jenkinsfile”，路径 Jenkinsfile。如果平台当前保存的是界面内流水线脚本，需要让它读取仓库文件，否则本次 Jenkinsfile 不会生效。
4. 保留现有代码与镜像仓库凭证，确认下表参数，再运行流水线。成功后产生 :dev 和 :dev-<提交号> 镜像；失败把流水线日志带回本机处理。

| 参数 | 配置 |
| --- | --- |
| GIT_BUILD_REF | dev（可用 refs/heads/dev），或 CODING 传入的完整提交 SHA；其他分支名拒绝 |
| GIT_REPO_URL / CREDENTIALS_ID | 现有内网 Gitee 地址和代码凭证；多分支流水线也支持 checkout scm |
| CODING_DOCKER_CREDENTIAL_ID | 现有镜像仓库用户名/密码凭证 ID；必须有拉取 base、推送应用权限 |
| NODE_IMAGE | 默认 ipd-docker.pkg.coding.byd.com/aftersales_ai/base/node:24.18.0-slim |
| NPM_REGISTRY | 默认 http://hub.byd.com:9081/repository/npm-npmmirror/ |
| REG_HOST / REG_PROJECT / REG_REPO | 默认 ipd-docker.pkg.coding.byd.com / aftersales_ai / aftersales_ai |

镜像目标：`ipd-docker.pkg.coding.byd.com/aftersales_ai/aftersales_ai/lighthouse:dev`。
不使用 DOCKER_IMAGE_VERSION 覆盖，避免测试流程误覆盖生产标签。不推送 latest、不部署容器、不迁移数据库。

## 构建过程

### 1.1.2 游戏目录默认显示

未设置 `NEXT_PUBLIC_SHOW_GAMES` 时默认展示文化游戏预告页、导航及搜索入口。只有构建时明确设置 `NEXT_PUBLIC_SHOW_GAMES=false` 才隐藏；旧环境若保留了 false，应删除或改为 true 后重新构建。该公开变量在构建时固化，修改运行容器环境不能替代重新构建。两款游戏仍是“开发中”预告，不提供玩法入口。

### 构建与依赖

使用内网 Node 镜像运行 `docker run --security-opt seccomp=unconfined --pids-limit -1 --memory 4g` 完成 npm ci、Prisma 生成、真实 DSH 工具/文本/取消 smoke、Next 构建及 standalone/知识 CLI 打包。随后 Dockerfile 只 COPY 组装镜像，无 RUN，兼容内网 classic Docker 的线程限制。

不从 GitHub 下载 DSH、不从公网下载 Prisma、不需要构建期模型密钥。npm 包仍需要内网镜像源。DSH 和系统依赖面向 Linux x64；Node 必须 24。基底中的 Debian/glibc 兼容性由本次内网构建验证。

员工应用部署必须配置统一门户、HTTPS origin、MySQL 与知识中台，先应用 Prisma 迁移，再由可信运维手动导入并发布知识。聊天模型及上传持久化也需独立配置。缺少认证配置或 schema 时关闭业务访问；不能把流水线成功当作业务验收通过。完整参数、部署顺序与平台验收条件见 [员工访问部署说明](../../docs/deployment/lighthouse-access.md)。

## 本机检查与限制

1.1.3 镜像已将随包 OpenSSL 加入 `PATH`，并用 `PRISMA_QUERY_ENGINE_LIBRARY` 指定随包 Debian/OpenSSL 3 查询引擎，避免精简基础镜像误判为 OpenSSL 1.1。使用仓库 Dockerfile 重新构建；不要通过更换 Windows 引擎或临时下载公网引擎处理此问题。

已检查 Shell/JavaScript 语法、离线包 SHA-256、归档内容和 Dockerfile 无 RUN。Windows 当前 Docker Linux daemon 不可用，未执行完整 Linux 流水线，内网流水线结果才是本次构建是否走通的依据。遇到错误保留完整日志；不要在内网 DSH 改文件。

## 2026-10-10 提交号触发修复

构建 #24 传入完整 SHA，旧检查误当成非 dev 分支。现在接受完整 SHA 作为触发信息，仍使用原凭证检出 dev 并检查 HEAD 等于 origin/dev。本计划构建当前拉取到的 dev，不构建 MR 临时合并结果。checkout scm 回退时计划 SCM 分支也须选 dev。Groovy 编译和 12 个触发参数测试通过；待内网重新运行确认。

## 2026-10-10：npm 11.16 锁文件修复

构建 #27 已通过全部离线校验，npm ci 报缺少 @emnapi/core@1.10.0 和 @emnapi/runtime@1.10.0。使用 npm 11.16.0 在本机复现同一错误，补全 @rolldown/binding-wasm32-wasi 下两条嵌套锁记录，其他已锁定依赖不变。npm 11.16.0 的 npm ci --dry-run 校验通过。无需在内网改用 npm install 或跳过锁文件检查。

## 2026-10-10：生产构建环境修复

构建 #28 在 /_global-error 预渲染时报 useContext 空引用。旧 Jenkinsfile 向构建容器传 NODE_ENV=development，Next CLI 保留已有值，不会自动覆盖为 production。现在容器改用 production，并在 npm run build 前显式 export NODE_ENV=production。npm ci 继续使用 --include=dev 安装构建工具。相同 Next 16.1.1 / React 19.2.3 的最小页面使用 webpack 构建做对照：development 复现相同 key 警告和 /_global-error useContext 报错；production 静态预渲染及构建通过。未执行完整灯塔 Linux 构建，待内网确认。

## 2026-10-10：镜像验证容器线程参数

内网已完成源码构建和镜像组装（7c3e4000fc36），但随后验证容器在 Node 启动时 uv_thread_create 断言失败。验证 docker run 漏了构建容器已有的线程兼容参数，现补上 --security-opt seccomp=unconfined --pids-limit -1 --memory 4g，保留 --network none 和镜像 USER node。Groovy/Shell 语法与模拟 Docker 参数捕获检查通过；实际内网验证需重跑。若之后部署在同类受限宿主机，也应核对运行容器的线程限制与 seccomp 配置，不能仅因镜像组装成功就视为可运行。

## 存储模式边界

员工应用的生产存储必须为 MySQL：`AUTH_MODE=portal`、`KNOWLEDGE_HUB_ENABLED=true`、`KNOWLEDGE_HUB_DRIVER=mysql`，并配置该环境的 `DATABASE_URL`。镜像不预置本机数据库地址、不复制运行数据库，不在启动时自动迁移或导入。SQLite 仅保留独立运维用途；不能用它启动正式员工应用，也不能作为 MySQL 故障回退。

`knowledge-cli`、源码的 hub CLI/MCP 均是受信任运维的直连数据库接口，不是员工工具。员工接收独立 `packages/lighthouse-client`，只通过浏览器授权取得 `knowledge:read`。服务器镜像、环境文件及门户密钥不向员工分发。

## 首次启动与离线来源

生产启动前先备份现有数据库与文件，使用本次可信运维源码并注入目标 MySQL 环境：

```sh
npm run db:deploy
npm run hub:import-existing -- --publish
```

完成迁移与初始化后再启动新应用，并检查 `/api/health/ready`。首次导入跳过既有固定 ID，不覆盖管理员维护版本；上述初始化不能代替人工资源、完整历史版本及文件的跨数据库迁移。旧共享管理员密码、预览身份和演示种子不再用于员工登录。

已有部署保留原持久卷与 SQLite 文件（包括历史 `lantern-knowledge`），明确实际路径并完成一致备份，再验收 MySQL 迁移/导入；不能只改驱动或创建新空卷。独立 SQLite 运维仍保留旧文件名回退；详见 [命名兼容说明](../../docs/deployment/lighthouse-naming-migration.md)。当前交付不自动进行 SQLite→MySQL 数据搬迁。

健康检查改用 `/api/health/ready` 的直接 200，认证配置或迁移未就绪返回 503。公开 `/api/health/live` 只表示进程存活；不能用 `/hermit` 跳转到登录后的 200 认定业务就绪。镜像构建、真实门户/MySQL 验收、测试部署与生产部署分别记录。

受限内网宿主机可能还需与 Jenkinsfile 一致的线程兼容参数，应按运行环境核对。

离线 manifest.json 的 applicationCommit=5d369d7 表示这些离线依赖提取时的原始应用来源，不表示本次最终应用版本。DSH、Prisma 与 OpenSSL 的来源和校验值保持不变；实际应用版本以 Git 提交及 dev-提交号镜像标签为准。

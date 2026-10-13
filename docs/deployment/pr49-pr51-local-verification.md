# 账号与部署 PR 本机合并验证

日期：2026-10-13。关联 [Issue #50](https://github.com/KeithChen51/Lantern/issues/50)、[账号 PR #49](https://github.com/KeithChen51/Lantern/pull/49)、[部署 PR #51](https://github.com/KeithChen51/Lantern/pull/51)。本记录验证两项改动共同运行的结果，不代表内网测试或生产已经部署。

## 验证基线

| 项目 | 实际值 |
| --- | --- |
| PR #49 输入 | `fdbe98f66c78a3d3af16c39376e7f4b823cc67a2` |
| PR #51 输入 | `d87634cf7588170f54d6ea996a90eab678b2d933` |
| 本地整合分支 | `codex/50-integration-verification` |
| 实际合并提交 | `843fa8840d81a18d3a7e44e3523166794347039c`，两个 PR head 均已验证为祖先 |
| 基线完整测试与 Linux 镜像源码 | `909db1e8d4f6e358a4abd070bb92172da50c62b4` |
| 恢复校验修复提交 | `7fdaf0acd8132c27e744be4345ae4dd02fc33445`；仅主机脚本、比较器及相关回归，未改变镜像内应用代码 |
| 镜像标识 | 版本 `1.1.3`，app/tools 均标记完整的 `909db1e` 源码 SHA；这是本地验证标识，未形成新发布版本 |
| Node / npm | Linux：24.18.0 / 11.16.0；Windows 验证进程：Node 24.11.1 |
| 实际数据库 | MySQL 8.4.9 Docker 容器，全部使用临时合成数据；不等同于内网 8.0.46 的验收 |

合并时解决两处部署文档冲突，并修正账号部署文档遗留的通用导入命令：现有测试环境只迁移 schema；首次生产使用受保护的 22 项初始化入口，不能调用旧的全量 `hub:import-existing`。后续真实恢复测试发现并修复了一处主机运维脚本误报，详见下文；应用及镜像内的运行代码未改动。

本机 main 仍为 `2dcc9b938e89542de730afd00d7b390b2e0086ff`。两个远端 PR 仍是以 dev 为目标的开放草稿；本次没有合并远端 PR、推送整合分支或部署内网。

## 构建与运行检查

| 检查 | 结果与实际边界 |
| --- | --- |
| `npm test -- --maxWorkers=2` | 70 个文件、493 项通过 |
| `npm run lint`、`npx tsc --noEmit` | 均退出 0 |
| `npm run test:client` | 19 项通过，包含真实 Windows DPAPI 合成凭据往返、CLI stdio MCP 握手 |
| 运维独立检查 | `node --test scripts/intranet/operations.test.mjs` 9 项通过；完整测试内含环境编排的 16 项模拟 Docker 回归 |
| Windows standalone HTTP smoke | 38 项通过，涵盖登录页、页面跳转、API 拒绝、旧路由退役、live/ready 和静态资源；未连接真实门户 |
| Linux `bash scripts/intranet/build.sh` | 完整退出 0：离线校验、依赖安装、Prisma generate、DSH 自检、知识校验、Next 生产构建、standalone、运维镜像上下文打包 |
| Linux 真实 DSH runtime smoke | 5 次合成模型请求、4 次工具调用，流式文本与取消检查通过；不是内网真实模型接口验证 |
| Linux 镜像组装 | app、tools 均成功，Linux/amd64、非 root 运行、版本及 revision 标签一致 |
| 断网镜像自检 | app 在 `--network none` 下校验 DSH runtime manifest 和 `node:sqlite`；tools 在断网下验证 Prisma 原生引擎、CLI 与 22 项清单，均退出 0 |
| 独立审查 | 先规格审查、后质量审查，通过；账号部署文档的初始化冲突已修正并复核 |

本地镜像仅保留在 Docker daemon，未推送任何仓库。以下是本地 image ID，不是仓库 manifest digest，不应直接填入部署模板：

| 标签 | 本地 image ID |
| --- | --- |
| `lighthouse:pr4951-app` | `sha256:c117613e763dedc884f79134c11156d929b6382e1a09c7a18302623aa29f4b86` |
| `lighthouse-tools:pr4951-tools` | `sha256:1798865c69ddd00203e1e52462198145f8870c6b2b2076a41d64919446f97974` |

## 真实数据库与最终镜像联测

独立 MySQL 场景均通过，验证的不只是模拟数据库：

1. 8 项迁移后首次初始化：22 个资源、22 个发布版本、4 个文件夹；18 个 internal 案例、4 个 public 资源。`case-insight` 有 11 个文件，标准化 Skill 有 15 个文件。
2. 再次执行实际初始化 CLI 返回失败，数据库快照不变。
3. 修改知识版本、附件、可见性、位置、回收站及合成账号记录后执行 schema-only 升级，完整快照不变。
4. 在资源与发布记录写入之后，由真实 MySQL trigger 制造文件夹写入失败；InnoDB 事务完整回滚，应用表均为 0 行。
5. 两个初始化事务同时执行，仅一个成功，另一个以 Prisma `P2034` 拒绝；最终仍是 22/22/4，没有重复导入。
6. 只有旧 7 项迁移、已有知识内容的数据库，执行第 8 项账号/元数据迁移成功；原有表数据保持一致，新账号表为空。

主控制器另外使用最终 app/tools 镜像完成 6 项运行检查：

- 空库启动 app，`/api/health/ready` 返回 503，数据库没有被应用自动建表。
- tools 镜像执行 migrate、initialize，得到 22 个资源、22 个版本、4 个文件夹。
- tools 重复 initialize 被拒绝，数量不变。
- 使用 `NODE_ENV=production` 和 HTTP 私网测试配置，ready 返回 200、登录页返回 200、匿名后台 API 返回 401。
- 登录发起接口返回 200，事务 Cookie 为 HttpOnly，HTTP 测试配置下不带 Secure 或 `__Host-`；真实门户未被调用。
- 按正式 `prepare_root` 步骤配置持久化目录权限后，非 root app 可写入上传目录；重启后文件仍在，ready 仍为 200。

## 备份与恢复

使用与 Compose 一致的 `utf8mb4` / `utf8mb4_unicode_ci` 服务器及数据库参数、独立源库/恢复库和各自的应用账号，执行与 `environment.sh` 完全相同参数的 mysqldump、恢复、重新 dump。账号只有各自数据库范围内的权限，未靠 root 执行逻辑备份恢复。

实测 MySQL 8.4.9 恢复后，199 个字段定义会补写冗余的 `CHARACTER SET utf8mb4`。所有表行、列语义、22 个资源及 23 个版本均一致，但旧 `cmp` 按原始 SQL 字节比较会失败。这是本次发现的真实恢复校验缺陷。

修复只在真实 `CREATE TABLE` 字符列前缀中统一这一等价写法，其他字节仍完整比较。比较器流式读取 gzip，通过固定 tools 镜像断网、只读执行；不改备份、不连数据库，也不要求宿主机安装 Node。无效压缩包、读取错误、未闭合的 SQL 引号或表定义、其他差异均失败。不支持的格式及超过 8KiB 的 DDL 行保持原始字节，不会为通过验证而忽略差异。

| 实际检查 | 结果 |
| --- | --- |
| 全部表行与 information_schema 列语义比较 | 一致，含历史版本、回收站及合成账号密文 |
| tar 恢复与 SHA-256 校验 | 3 个合成文件全部一致，含中文附件名、二进制上传和私密配置样本 |
| 恢复密钥与原密文 | 使用实际解密实现成功解密合成凭据 |
| 新比较器的 Node 回归 | 7 项通过，含多种分块、长行、无效字节/换行、字符串和注释中的伪 DDL、数据/结构变化及无效文件 |
| 修复后的环境脚本回归及 lint | 主控制器重跑 16 项全部通过，含恢复比较失败时拒绝通过；修改文件的 ESLint 退出 0 |
| 主控制器的实际 tools 容器比较 | 真实备份与恢复文件退出 0；故意修改行内容、故意修改字段长度均退出 1 |
| 独立审查 | 比较器规格及质量审查通过，独立复跑 Node 测试通过 |

真实文件经唯一允许的字符集规范化后均为 638040 字节，SHA-256 为 `776c52b7733311f98a8ed6f5a77cabb36f5a879c20c6f0ffe72622693abd8cbf`。原始 gzip 校验仍在恢复入口首先执行，SQL 比较不会代替备份包完整性检查。

以上是实际 MySQL 和文件组件检查，加上环境脚本的模拟 Docker 编排回归；不等于已在内网执行整个 `environment.sh restore-verify` 或建立定时备份。

## 验证过程中遇到的问题

- 首轮 4 worker 测试有 2 项冷启动超过原 5 秒上限。未修改超时或断言，改为 2 worker 后完整 493 项通过。
- 本机 Docker Desktop 在验证期间更新并暂时失去 engine 连接，恢复后才执行真实 Docker 检查；不再沿用前次“本机无可用 engine”的限制。
- Linux npm 下载 SWC 包遇到网络超时。使用官方 registry 的同版本 tarball、核对其 SHA-512 与 lockfile integrity 完全相同后填入该临时容器缓存，再执行原 `npm ci` 和完整构建成功；未改变源码、lockfile 或依赖版本。
- 运行验证脚本最初使用了错误的 SQL 表名，随后漏做正式部署流程已有的 `/data` 所有者设置；修正验证脚本后最终镜像检查通过。没有放宽产品权限。
- MySQL 测试的 trigger 创建与迁移后连接元数据缓存问题均为测试夹具问题，修正夹具后重跑通过；没有因此更改应用实现。

## 下一步及验收边界

本机组合验证通过后，仍按已确认顺序进行：内网 dev 流水线构建 → 原 HTTP 私网 IP 测试环境升级与联调 → dev 到 master 的 PR → master 流水线构建生产镜像 → 首次生产空库初始化与联调。以后版本升级只迁移 schema，不重新初始化已有知识资料或覆盖内网维护的 Skill。

还需内网实际确认：CODING 流水线与镜像仓库、MySQL 8.0.46、门户是否接受 HTTP 测试回调及真实角色/撤权流程、模型连接和流式返回、生产 HTTPS 网关、现有测试卷接管、整套备份恢复流程与每日 14 天保留调度、同机资源容量。员工 CLI/MCP 的真实认证仍按其 HTTPS 约束验收。

原始日志与合成测试夹具保存在本地整合 checkout 的 `.next/integration-evidence/`，未提交运行密钥或数据库副本。镜像源码固定为 `909db1e`；后续提交只增加主机恢复校验修复、相关回归和文档，比较器已用这对真实镜像验证，镜像内的应用及工具内容未变化。本次临时容器、网络和数据卷已清理，仅保留本地镜像与验证资料。

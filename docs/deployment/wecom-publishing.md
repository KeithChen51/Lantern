# 企微发布内网部署与验收

关联 [Issue #165](https://github.com/KeithChen51/Lantern/issues/165)。发布服务由灯塔保存稿件、文件、受众快照和北京时间排期。网页、CLI 与工具调用使用平台管理员权限。每个应用各自记录执行尝试和企微受理结果。

## 运行配置

应用和 `publication-worker` 使用同一个应用镜像摘要、同一个数据库、同一份私有 `APP_ENV_FILE`，并共享 `${DATA_ROOT}/app` 到 `/data` 的挂载。稿件目录固定为 `/data/publishing/wecom`。MySQL 迁移随匹配的 tools 镜像交付。

在私有应用配置中填入所需通道的配置，示例键见 `deploy/intranet/environments/app.env.example`。集团通道填写 HTTPS 基础地址、应用 ID 和 AppKey。汽车通道填写企业 ID、数字应用 ID 和应用 Secret。两套凭证由服务端读取。配置完成后设置 `WECOM_PUBLISHING_ENABLED=true`。

在私有控制文件中设置 `WECOM_PUBLISHING_WORKER_ENABLED=true`，运维脚本会启用 Compose 的 `publishing` profile。默认值为 `false`，可继续升级原有镜像。首次开启时需先切换到包含 worker 入口的新应用与 tools 镜像，再执行迁移与启动流程。两份配置开关应在启用时同时为 `true`，运维预检会在停写前核对应用与 worker 的启用值、镜像、数据库与稿件目录。

维护暂停时可保留应用开关开启并关闭 worker 控制项，既有排期会保持等待。恢复执行前核对到期任务。单独把控制项设为 `false` 需要按升级流程停止已有 worker，修改配置文件本身不会改变运行容器。

## 构建与启动

`npm run build` 的 standalone 准备步骤通过 esbuild 打包 `scripts/wecom-publication-worker.ts` 和心跳检查程序。worker 入口位于 `.next/standalone/scripts/wecom-publication-worker.cjs`，从 standalone 根目录解析已有的生成 Prisma 客户端。内网构建在复制 Linux query engine 后执行 `--check`，核对入口和依赖可离线加载。

新服务沿用 node 用户、应用镜像摘要及私有运行配置。Compose 使用 `restart: unless-stopped`，只连接数据库和出站 runtime 网络。worker 每 5 秒检查一次到期任务，不依赖浏览器或 DSH 对话存活。`SIGTERM` 或 `SIGINT` 会停止领取新任务并等待当前尝试完成，容器给予 120 秒退出时间。超时后容器可能被强制停止，恢复时按数据库中保留的阶段处理。

正常部署使用现有 `environment.sh initialize` 或 `upgrade`。网页 ready 后才启动已启用的 worker，并等待心跳变为健康。旧测试环境使用 `existing-test.sh` 时，应在原 Compose 中增加同版本、同库、同 `/data` 挂载的 `publication-worker` 服务，避免改变旧卷。可通过可选的第 11 个参数指定已有 worker 服务名。

worker 心跳每 10 秒写入容器私有 `/tmp/lighthouse-wecom-worker.json`。Compose 健康检查拒绝超过 45 秒的心跳和停止状态。此检查覆盖执行进程存活，数据库领取能力、企微鉴权和出站上传发送需通过下方业务验收。

## 备份、升级与恢复

运维脚本先停止 worker，再停止 app，完成数据库与 `/data` 文件备份。普通备份结束后恢复原先运行的服务。备份失败时也尝试恢复原服务。迁移开始后若失败，app 和 worker 保持停止，保留备份供调查。

`ENVIRONMENT=restore` 拒绝启用 worker。恢复验证只启动独立数据库，保留原始配置供核对。实际恢复执行前，先核查数据库恢复点之后已受理、部分受理和待核验的消息，避免用较旧备份重新发送。发送时的网络超时和丢失响应可能仍已被企微受理，应按任务记录核验。

## 内网验收

- 记录 app、worker、tools 的版本、完整提交和摘要，核对数据库迁移、持久目录权限及 worker 心跳。
- 从 worker 容器验证两条通道各自的鉴权、封面上传、正文图片上传和受控单人实收。汽车通道应从已登记的可信出口完成上传与发送。
- 后台提交本人双通道白皮书排期，确认任务编号、稿件版本、两套受众和北京时间。分别核对两条通道的受理记录与实收。
- 从内网 DSH 使用可追溯到管理员的灯塔登录，上传指定工作区文件或附件后排期。关闭对话，再按同一编号查结果。员工 CLI/MCP 使用正常证书验证的 HTTPS 入口。
- 用普通员工、知识管理员及经销商身份验证发布接口和后台入口被拒绝，用平台管理员完成上传和排期。
- 验证 worker 重启、双实例竞争、单通道明确失败、请求超时待核验，以及备份与升级期间停止领取任务。核对异常恢复后既有受理记录保持一致。

真实企业地址、凭证、成员账号与回执应保存在内网私有验收记录中。回传公开仓库的验证摘要使用脱敏值。

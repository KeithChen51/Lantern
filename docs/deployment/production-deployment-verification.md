# 生产与测试部署改造验证记录

日期：2026-10-13。关联 [Issue #50](https://github.com/KeithChen51/Lantern/issues/50)。本记录是本地实现与验证证据，不代表内网已部署或生产已验收。

## 源码与依赖

- 部署开发分支 `codex/50-production-deployment`，基于 `origin/dev` 的 `32ecb100c1f57d02d3dfc172e930c4812e88573b`；开发 PR 目标为 dev。
- 账号功能依赖 [PR #49](https://github.com/KeithChen51/Lantern/pull/49)，本次组合验证使用其 `fdbe98f66c78a3d3af16c39376e7f4b823cc67a2`。
- 独立组合验证 checkout 的最终代码提交 `b81c271634654c3563353f47fd4e25ef0ee5d812`；仅供本地集成核验，未合并、未推送为正式交付。
- 集成时保留账号模块的 auth:prune、Prisma 迁移、标准化 Skill 新目录、HTTP 测试例外和严格 ready 健康检查。初始化资源仍使用原有稳定 ID `lantern-knowledge-standardize`。
- 本机 main 未因本项修改；后续完成 dev 集成与版本评估后，才形成 main 交付版本。内网生产分支名为 master，与本机 main 区分。

## 已执行的本地检查

环境为 Windows、Node 24.11.1。内网流水线使用其已配置的 Linux Node 24 镜像，本地结果不能替代该镜像的真实执行。

| 检查 | 结果与边界 |
| --- | --- |
| 部署分支完整 npm test | 53 文件、255 项通过；随后审查修复另跑受影响测试 |
| 账号与部署组合完整 npm test | 70 文件、486 项通过；未将重复运行累计为新测试数量 |
| 两个 checkout 的 npm run lint / npx tsc --noEmit | 均退出 0；后续脚本/测试修复另做针对性 lint |
| 组合 npm run build | 通过：发布记录、8 个源字体、23 个静态知识来源、Next 编译/类型/页面生成、standalone 准备及 8 个 standalone 字体 |
| node --test scripts/intranet/operations.test.mjs | 最终 9/9 通过；真实 CLI 打包与 22 项预览，模拟工具分派/错误退出，提取真实 Jenkins Shell 做分支、发布和标签守卫回归 |
| 环境编排回归 | 最终 16/16 通过；fake Docker 检查命令顺序、现有数据保护、数据库连接变更拒绝、备份路径隔离及失败处理 |
| Jenkins / Shell / Compose | Groovy 语法编译、6 个流水线 Shell 块及运维 Bash 语法通过；实际 docker compose config 解析通过，包含网关 override；此步骤无需 Docker daemon |
| 初始内容 | 核对 22 个唯一资源：2 文档、18 internal 案例、2 Skill；case-insight 包含 11 个文件。默认预览不连接数据库 |
| 独立审查 | 先规格后质量；已修复数据库连接变更、备份路径重叠和镜像标签不匹配放行问题 |

构建最初因验证 checkout 的 node_modules junction 指向目录外被 Turbopack 拒绝；改为验证目录内的实际依赖副本后通过，没有为此修改产品构建配置。原共享依赖未改变。

## 尚未执行的目标环境验证

本机 Docker CLI 可用，但 Linux engine named pipe 不存在，Docker 服务停止；尝试启动未能建立连接。未运行真实 Linux 镜像组装、自检或 MySQL 容器，以下均保持待验收：

- Linux app/tools 镜像组装、离线 verify、推送与实际 registry digest；内网 Jenkins 完整流程。
- 真实 MySQL 迁移、空库 22 项初始化、重复初始化拒绝、事务回滚及并发保护。
- 现有测试的匿名/命名卷保持、上传与知识历史状态保持、备份和隔离恢复的 SQL/文件一致性。
- 门户是否接受 HTTP 测试回调、真实员工/管理员会话、撤权与角色降级；生产 HTTPS 网关、流式路引、上传。
- 单机运行容量、每日备份调度和 14 天保留；目前仅同机备份，不能应对整机或备份盘损坏。

按[部署流程](production-environments.md)先完成 dev 测试与回传，再通过内网 dev → master PR 构建生产镜像，执行首次生产初始化和联调。后续升级只迁移 schema，不重新导入初始资料。流水线没有自动部署或生产初始化动作。

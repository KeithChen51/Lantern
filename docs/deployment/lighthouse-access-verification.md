# 员工访问接入验证记录

日期：2026-10-13。关联 [Issue #48](https://github.com/KeithChen51/Lantern/issues/48)，开发目标分支为 `dev`。本记录描述本地实现与验证，不表示已合并、已接通真实门户或已部署。

## 已完成

- 门户员工身份、精确应用角色、加密上游授权、服务端 Web 会话、CSRF、退出与工具授权撤销。
- 全站业务页面、知识接口、路引对话、附件与业务静态文件的访问检查；旧预览身份、共享管理密码及已退休写入入口关闭。
- 知识管理写入前重新检查权限，批次中途撤权停止后续条目；已发布版本使用独立元数据，旧版本来源未知时仍可引用真实版本与行号。
- 独立员工 CLI/MCP 只开放知识读取、检索和下载；设备确认、刷新令牌轮换、重放撤销及系统凭据存储。
- 活跃源码和新入口统一为 lighthouse。旧存储路径、固定资源 ID 与维护 MCP 协议保留经过测试的兼容入口，详见[命名兼容说明](lighthouse-naming-migration.md)。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| `npm test -- --maxWorkers=4` | 67 个文件，459 项通过（含 HTTP 测试部署新增 38 项） |
| `npm run test:client` | 19 项通过 |
| `npm run test:knowledge-standardize` | 标准化 17 项、知识导入兼容 5 项通过 |
| `npm run lint` | 通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | 知识源检查、Next 生产构建、standalone 组装和字体检查通过 |
| 独立复审 | 先规格、后质量；认证、知识、路引、页面、部署、命名和员工客户端范围无剩余阻塞发现 |

在隔离的本地生产构建中使用合成配置、不可达测试数据库运行 `node scripts/access-smoke.mjs http://127.0.0.1:4318`，检查登录页、匿名业务页、RSC/页面数据、API、全部实际生成的 JS chunks、旧入口、回调失败清除 token、健康端点、CSS 和品牌图。38 项通过：业务 API/JS 拒绝匿名访问；页面跳转登录；已退休入口返回 410；无数据库时 ready 返回 503。Next 16 会先移除 flight 请求标记并归一化数据 URL，这些请求收到禁止缓存的登录跳转，不包含业务正文。检查脚本仅允许 localhost，且预期数据库未就绪，不能当作正式部署验收命令。

浏览器核对了员工登录页和原生表单失败状态，页面无需匿名加载业务 JavaScript。Windows DPAPI 使用合成凭据完成了真实加密存储往返；macOS Keychain、Linux Secret Service 仅验证了适配器契约。

## 尚未验证的发布条件

1. 真实门户应用/角色配置，身份查询代表有效内部员工的语义，禁用/离职与撤权传播，回调 state 和返回地址绑定。
2. 真实 MySQL 迁移、并发事务与重试、JSON active 查询、多实例撤销，以及代表性历史数据迁移。当前机器没有可用 MySQL，Docker daemon 未可用，未将内存测试冒充数据库验收。
3. 真实 HTTPS/代理日志脱敏、完整浏览器登录及工具设备授权、DSH 模型对话，生产平台和网络配置。

发布前按[部署说明](lighthouse-access.md)备份原数据，应用新增迁移并完成上述验收。没有自动 SQLite→MySQL 数据搬迁；不要通过换空卷或切换驱动来代替迁移。当前没有合并到 dev/main，也没有部署。

## HTTP 测试部署补充验证

按用户确认的约束，测试保留 HTTP 内网 IPv4，正式部署仍使用 HTTPS，两者运行 production 构建。新增配置与 Cookie 测试 38 项；独立复审执行认证相关 106 项测试，并额外检查 15 个错误/攻击地址、4 个有效地址，均符合预期。真实路由/认证服务结合合成门户、MemoryStore 验证了登录事务、会话、同源/CSRF、退出及重放拒绝；不等于真实 MySQL 和平台联调。

重新执行 lint、TypeScript、production 构建通过。初次全量测试与构建并行时，一项既有附件动态导入测试超过默认 5 秒；构建结束后以 4 个 worker 重跑全部 459 项通过，未放宽测试超时或跳过用例。production standalone 使用合成的 HTTP 测试 origin、不可达测试数据库，在 loopback 监听；冷启动首轮登录页超过检查超时，服务就绪后重跑 38 项全部通过。未修改真实 IP、网络或服务器。

门户接受 HTTP IP 回调的权限与浏览器行为尚未验证。员工 CLI/MCP 仍然只支持 HTTPS，本次不提供 HTTP 工具授权例外。

## 2026-10-16 部署配置与升级预检补充

部署示例显式选 `PORTAL_LOGIN_MODE=card`，补充精确服务端 `PORTAL_API_HTTP_ORIGIN` 和可选平台管理员角色；卡片身份确认与 callback/state 协议分别说明。生产和测试可共用已确认的门户 appKey、配套凭据和角色，本地数据库、上传、会话 Cookie 与 `AUTH_ENCRYPTION_KEY` 仍隔离。当前门户只证实卡片携 token 进入，未证实 `redirectUrl` / `state` 契约。

`existing-test.sh upgrade` 在停应用、备份和迁移前，将最终 Compose 应用环境送入同提交 tools 镜像打包的真实 `readAccessConfig`。预检断网、只读、只输出固定脱敏结果，不继承工具镜像默认环境来补齐配置。fake Docker 回归实际执行该打包入口，验证 18 类缺失/错误配置被提前拒绝，并保留原卷与普通升级禁止初始化、seed/import 的检查。

| 本次部署部分检查 | 结果 |
| --- | --- |
| `npm test -- --run src/build/environment-operations.test.ts --maxWorkers=1` | 34 项通过，含 Bash 语法、备份/恢复/升级及认证预检拒绝 |
| `node --test scripts/intranet/operations.test.mjs scripts/intranet/environment/compare-mysql-dumps.test.mjs` | 16 项通过，含可信工具打包与错误输出脱敏 |
| 修改的 TypeScript / JavaScript 文件 ESLint | 通过 |
| `npx tsc --noEmit` | 生成本地 Prisma Client 后通过，未连接或修改数据库 |
| `git diff --check` | 通过 |

另将预检入口与本次新认证配置实现组合，使用合成地址/凭据执行 11 个 CLI 场景：card + 精确内网 HTTP API、callback + HTTPS API 通过；缺 HTTP 例外、错误端口、非规范/公网 origin、HTTP 浏览器登录、错误模式、缺 secret、错误加密密钥和缺应用服务均拒绝，未输出测试秘密。以上是本地配置与脚本证据；真实门户卡片落点、浏览器确认、员工/角色语义、MySQL 与 Linux 镜像联合部署仍需内网验收。没有对现有测试知识库执行初始化、seed 或导入。

## 2026-10-16 卡片登录与“我的”联合验证

本次补充取代上述“没有可用本地 MySQL”的历史限制，但不代表内网验收通过。使用隔离的 Docker MySQL 8.4、合成员工与门户服务、production standalone，在私有 IPv4 HTTP 地址完成真实 Chromium 浏览器验证；没有连接内网数据库、使用真实员工 token 或修改现有测试容器。仅对本轮新建的空 QA 数据库应用迁移并初始化 22 条测试知识资源。

“我的”替代桌面和移动菜单底部原有消息、建议入口，展示已登录身份、姓名、工号和门户角色查询返回的组织路径。头像当前使用姓名首字占位，没有假定上游存在头像字段。版本消息进入现有更新页；建议反馈显示“反馈提交暂未开放”并可返回“我的”，旧反馈写接口仍关闭。工具授权和退出登录保留。

验证链路：匿名 `/me` 跳转登录 → 前往固定门户地址 → 卡片携 token 进入根路径 → 清除 URL token 并展示账号确认 → 原生 POST 确认 → 查看“我的” → 版本消息、建议反馈、工具授权 → 手机菜单 → 原生 POST 退出。另验证坏 state 不降级、无效 token 拒绝、空角色员工普通访问及管理接口 403。桌面 1440×960、手机 390×844 的内容、图标、菜单和跳转正常，无横向溢出或框架错误覆盖层。认证页有意禁止脚本，控制台对应 CSP 阻止记录符合设计；业务页面没有相关运行错误。

真实浏览器发现并修复两项原有问题：

- HTTP 原生表单在 `no-referrer` 下发送 `Origin: null`，被同源检查拒绝。普通认证页改为 `strict-origin`，保留严格 Origin/CSRF 检查；token 消费和回调响应仍为 `no-referrer`，不发送路径或查询参数。
- 同一页面并发加载脚本时，每次鉴权写 grant/session 引起 MySQL `P2034`，脚本返回 503、页面无法交互。新逻辑对新鲜权限只读，刷新按观测世代提交一次，会话活动按最多 60 秒合并；每次仍读库检查会话、授权和员工状态。idle 可能提前最多一分钟过期，不延长权限有效期。

真实 MySQL 对新鲜会话、活动更新时间到期、身份/角色刷新到期三组各 16 个并发请求全部通过（48/48）；登录、退出与角色检查后知识资源仍为 22 条。安全复审确认刷新竞争者不能覆盖赢家，最终身份返回前仍检查撤销；相关 62 项测试通过。

最终代码验证：`npx vitest run --maxWorkers=2 --testTimeout=20000` 73 个文件、553 项通过；`npm run test:client` 19 项通过；`npm run lint`、`npx tsc --noEmit`、`npm run build` 与 `git diff --check` 通过。此前全量运行在默认 5 秒限制下有既有附件/初始化测试超时，相关文件单独按默认限制重跑 8 项通过；最终全量只通过命令行延长单项时限，没有跳过测试或修改用例时限。

本地验证不覆盖真实中台员工有效性、网络放行、真实门户卡片链接、Linux 生产镜像及跨实例故障恢复。没有执行 Bruno 或声称内网登录已通过；员工 CLI/MCP 的完整设备登录仍需 HTTPS 环境单独验收。卡片模式确认后返回首页，callback/state 模式保留绑定的返回路径。

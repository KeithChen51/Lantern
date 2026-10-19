# 访客模式本机验证记录

关联 [Issue #60](https://github.com/KeithChen51/Lantern/issues/60)。验证日期：2026-10-19。

本记录验证源码 `afaa74310018f3ed8b5c41ea6ed7c30a792a5e8e`，不表示已合入 dev/main 或已部署到内网。应用版本仍为 1.2.3，发布版本另行评估。

## 自动化检查

| 检查 | 结果 |
| --- | --- |
| `npm test -- --reporter=dot --maxWorkers=1` | 84 文件、723 测试通过 |
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0，含知识校验、standalone 准备、字体检查 |
| `node --test scripts/intranet/operations.test.mjs` | 9/9 通过 |
| `npm run test:client` | 19/19 通过 |
| `git diff --check` | 通过 |

最初并行测试出现附件模块加载与部署脚本超时；完整单 worker 重跑通过，未放宽断言。客户端首次运行遇到 Windows 临时文件锁 `EPERM`，完整重跑通过，未修改客户端代码。

独立复核发现并修复了附件上传队列跨身份继续执行、无可见性快照的旧版本泄露，以及过滤内部版本后复活已退役政策三项问题，均有对应回归。

## 真实本机运行

使用独占临时 MySQL 8.4、合成数据、本机临时 HTTPS 反代和真实 production standalone。没有使用真实 IAM、员工账号或模型密钥。所有模式使用同一产物：

- Next BUILD_ID：`cBimSGnlKjHeLtxJMdONS`
- standalone server.js SHA-256：`2abbab2e06d7d23a109f176dd292b7ebc6ca90eed6598c01f4ee2a3b57ac269f`

`prisma migrate deploy` 9 个迁移全部成功，新增 `guest_id` 为可空列。再次运行无待执行迁移，6 个合成知识资源及版本的完整快照不变，无归属旧对话仍保留 NULL。

44 项运行态检查全部通过：

- 无 IAM 配置的 guest ready 返回 200；页面签发不透明 HttpOnly/Secure/SameSite Cookie，API 本身不签发身份。
- 两个独立 Cookie 容器拥有不同身份、CSRF 和对话归属；篡改、过期、清理 Cookie 后无法取回旧身份或认领旧对话。
- “我的”服务端渲染显示访客和版本消息，无员工退出入口。
- 公开资料的 SSR、搜索、正文和附件正常；内部、草稿、归档、过期及缺少可见性快照的旧资料在 API、文件和下载入口均不可见。
- 附件上传及本人删除正常；另一访客不能删除或用于聊天。缺失/错误 CSRF、跨源及 cross-site 写请求被拒绝。
- 后台、工具授权、CLI/MCP 入口与 IAM 同步均不向访客开放，没有创建员工 User 记录。
- 同产物切到完整合成 IAM 配置后 ready 200，原访客 Cookie 访问页面跳转登录、访问身份 API 返回 401；IAM 缺配置、访客缺密钥均返回 503，不自动降级。
- 切换前后知识快照一致，匿名对话没有合并到员工账号。

运行态聊天归属测试使用受限 documentContext 在模型调用前终止，未将其记录为模型流式对话成功。两个独立 Cookie 容器由 HTTP 客户端模拟，没有宣称进行了真实浏览器交互。

临时反代首轮出现重复发送响应头的测试脚本错误，修复脚本后完整运行 exit 0；没有因此修改应用。任务创建的容器、卷、应用进程与临时凭据已清理。

## 内网待验收

真实 IAM 登录、回调和同步，模型网关及完整流式对话，浏览器上传与身份切换，以及 Linux app/tools 镜像构建、部署仍需内网完成。本机结果不能替代这些验收。

升级、数据保留及回滚步骤见[访客模式部署说明](lighthouse-guest-mode.md)。

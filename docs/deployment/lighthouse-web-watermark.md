# 网页隐形水印接入与验收

关联需求：[Issue #68](https://github.com/KeithChen51/Lantern/issues/68)。本文描述代码接入和部署步骤，不代表测试或生产已经启用、解码验收通过。生产 IAM 正在接入，水印启用以该环境员工登录验收通过为前提。

接入依据：[集团水印接入资料](https://sefd-aftersales.bydauto.com.cn/r/workspace-mu7uz523/byd-watermark-sdk-overview/)中的《接入指南-水印公共服务.md》及 `watermark-integration/SKILL.md`，核对日期 2026-10-22。

## 调用与身份

浏览器 → 灯塔 `POST /api/watermark/web/communicate` → 公共服务 `POST /watermark/web/communicate` → 集团水印服务。

- 灯塔后端复用现有员工会话、同源及 CSRF 校验，从已验证会话取得 `account`，以 `{objectId: account, objectType: 1}` 请求公共服务。工号按字符串保留前导零；本次不接入外部手机号或邮箱对象。
- 浏览器不能指定工号、模板、租户或目标地址。响应只含隐形水印参数、所属员工和会话到期时间，并禁止缓存。
- 公共服务负责租户配置、模板注入及对象获取/自动注册。灯塔不保存供应商 username/secret/模板 ID，不实现 i迪桥签名。现有两套供应商凭据应由公共服务负责人分别配置到测试、生产租户，换取对应的租户 API Key。
- 前端在员工业务页统一挂载官方 SDK，登录页和访客模式不加载。初始化保留 `conflictDetectionSwitch: true`；SDP 客户端已接管时，`skipped_client_watermark` 视为成功，不要求浏览器再出现 canvas。
- 正常运行每 30 分钟刷新，失败退避重试；退出、身份变化、会话到期或离开页面时取消请求并清理水印。浏览器恢复可见时检查状态。SDK 异步初始化按顺序执行，避免旧账号的迟到结果覆盖新账号。

SDK 的 `init` 没有取消接口。超过初始化时限会清理并标记 `retrying`，但后续初始化必须等待旧调用结束；如果供应商调用始终不返回，需要刷新页面恢复，不能强行并发初始化不同员工的水印。

公共服务不可用、响应异常、SDK 加载失败时不阻断灯塔业务，不把供应商 401 转成灯塔登录失效。浏览器隐藏节点的 `data-watermark-status` 提供不含密钥的状态，例如 `loaded`、`skipped_client_watermark`、`retrying`、`expired`，可在开发者工具检查。该策略可能在故障期间缺少网页水印，联调时须确认业务接受此行为；本次不提供强制遮挡页面或阻断访问模式。

## 环境配置

在对应环境的私密应用 env 文件设置，不能放入 `NEXT_PUBLIC_*`，不能提交真实值：

| 变量 | 内容 |
| --- | --- |
| `WATERMARK_ENABLE` | 默认 `false`；配置并完成验收后设为 `true`。 |
| `WATERMARK_BASE_URL` | 公共服务 origin，不带路径、查询参数、账号密码或末尾业务接口。允许 HTTPS；HTTP 仅允许 RFC1918 私网 IPv4。由服务负责人确认地址。 |
| `WATERMARK_API_KEY` | 当前环境灯塔租户的 Bearer API Key；测试、生产独立，不能使用供应商 secret 或 IAM secret。 |
| `WATERMARK_SDK_URL` | 可留空，由 `LIGHTHOUSE_DEPLOYMENT_ENV` 选择官方 SDK。显式配置时必须与该环境官方地址完全一致。 |

| 部署环境 | SDK 地址 |
| --- | --- |
| `test` / 本地 `development` | `https://watermarktest.byd.com:8443/sdk/js-sdk.js` |
| `production` | `https://watermark.byd.com:8443/sdk/js-sdk.js` |

测试镜像同样使用 `NODE_ENV=production`，务必保留 `LIGHTHOUSE_DEPLOYMENT_ENV=test`，否则会选择生产 SDK。配置在服务端运行时读取；修改后重启应用并刷新已打开页面，不需要数据库迁移。当前 compose 的应用 `env_file` 会传入这些变量。

需确认应用服务器可访问公共服务，员工浏览器可访问对应 SDK 域名及其依赖资源。HTTPS 页面不能引用 HTTP SDK。内网公共服务 HTTP 传输仅用于已确认的受控网络；可用 HTTPS 时优先使用 HTTPS。

配置模板：测试用 `deploy/intranet/environments/test-app.env.example`；IAM + 中台角色用 `iam-portal-app.env.example`；IAM 同步模式用 `app.env.example`。这些模板的水印开关均保持关闭。

## 联调与验收

1. 公共服务负责人确认两个独立租户、各自供应商凭据、隐形模板及 API Key。API Key 通过私密渠道交付，验收记录只写配置状态。i迪桥的申请或授权归属由公共服务负责人确认，不以本代码替代集团流程要求。
2. 先在测试环境启用。用 IAM 员工 A 登录，确认水印接口返回 200、`owner.account` 等于已登录工号、响应 `Cache-Control` 含 `no-store`。浏览器请求和打包脚本中不得出现公共服务 API Key 或供应商 secret。
3. 在无 SDP 接管的终端截图、拍照，并通过集团水印平台解码，确认绑定员工 A。覆盖本心、镜鉴、笃行、路引及员工有权限的管理页；不能用“看不到水印”判定失败或成功。
4. 在有 SDP 的终端确认 SDK 返回 `skipped_client_watermark`；按集团要求验证实际截图追溯。该状态不要求网页再绘制一层水印。
5. 验证刷新、后台停留后恢复、退出、会话到期及 A/B 账号切换，确认没有旧账号残留。服务响应迟到时也不能给下一位员工初始化旧数据。
6. 模拟服务断网、超时、供应商 401 和 SDK 加载失败，确认有脱敏诊断及重试，页面仍能使用，员工不会因供应商错误退出登录。恢复后验证重新初始化。
7. 检查关闭开关、登录页、访客部署时不加载 SDK、不发水印请求。正式启用生产前，使用生产租户独立重复员工身份及解码验证。

页面自动化和 mock 测试只覆盖请求边界、SDK 调用及生命周期，不能替代真实 SDK、SDP、截图拍照解码验收。浏览器不支持覆盖的原生全屏视频、导出文件及附件水印不在本次范围内。

## 接入记录

只记录标识、状态和证据位置，不记录 API Key、secret、完整水印参数或会话凭据。发布人员按真实结果补齐：

| 记录项 | 测试 | 生产 |
| --- | --- | --- |
| IAM 员工登录验收 | 待验证 | 接入中，待验证 |
| 公共服务租户标识 | 待负责人提供 | 待负责人提供 |
| username / secret / 隐形模板配置 | 凭据已取得，待租户配置确认 | 凭据已取得，待租户配置确认 |
| 租户 API Key 状态 | 待私密配置 | 待私密配置 |
| 环境变量及网络连通 | 待验证 | 待验证 |
| 员工账号绑定、刷新与退出 | 待实测 | 待实测 |
| SDP 接管结果 | 待实测 | 待实测 |
| 截图 / 拍照解码证据 | 待验收 | 待验收 |
| 发布提交、时间、验证人 | 待发布 | 待发布 |

## 回滚

将当前环境 `WATERMARK_ENABLE=false`，重启应用并刷新已打开页面，确认不再加载 SDK 或发起水印请求。已有页面必须刷新才能接收新开关；不要把只重启服务当作所有客户端已经清理。此次接入没有数据库迁移，不修改 IAM 配置和员工权限。

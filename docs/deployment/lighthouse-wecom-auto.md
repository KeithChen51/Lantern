# 比亚迪汽车企微工作台登录

从比亚迪汽车企微工作台点击「去灯塔」时，灯塔发起静默网页授权。后台用本应用的凭据取得成员身份并读取成员资料。读取成功且成员已激活，才会开通普通经销商账号。应用可见范围以企微管理后台为准。经销商可以浏览平台、查阅已公开发布的知识和使用路引。集团员工的企微工作台接入由同一需求单跟踪。[需求 #76](https://github.com/KeithChen51/Lantern/issues/76) · [官方网页授权](https://developer.work.weixin.qq.com/document/path/91022) · [官方读取成员](https://developer.work.weixin.qq.com/document/path/90196)

使用已配置 IAM 的 HTTPS 灯塔站点。在应用后台登记同一个站点域名为网页授权可信域名，并按企业配置登记灯塔服务端的可信出口 IP。「去灯塔」按钮使用 `https://<灯塔域名>/auth/wecom/auto/start`，回调固定为 `https://<灯塔域名>/auth/wecom/auto/callback`。默认进入灯塔首页，如需指定站内业务页，可为入口增加 URL 编码后的 `returnTo`。用户需能从企微客户端访问灯塔，灯塔服务端需能访问 `qyapi.weixin.qq.com`。

在私有应用运行配置中设置以下变量。使用比亚迪汽车企业的 CorpID 和灯塔自建应用的 AgentId、Secret。

```dotenv
WECOM_AUTO_ENABLED=true
WECOM_AUTO_CORP_ID=
WECOM_AUTO_AGENT_ID=
WECOM_AUTO_SECRET=
```

本功能使用现有用户表、身份映射表和会话记录表。灯塔以企业和成员 ID 关联经销商用户，并每隔最多五分钟在有请求时复查成员的可见范围及激活状态。绝对会话期八小时，空闲期一小时。设置 `WECOM_AUTO_ENABLED=false` 并重新加载应用配置可关闭入口及经销商会话访问。

内网验收时，先用可见范围内的试点成员打开工作台应用，确认「我的」页面显示经销商身份，可以查阅已公开发布的资料并访问自己的路引对话。再用范围外成员验证拒绝访问。移出已登录成员并等待下一次范围复查，验证会话失效。检查同一浏览器切换 IAM 与企微入口时的账号和权限，以及移动端和桌面企微内的回调、加载和退出。记录结果时只保留脱敏状态。

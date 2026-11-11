# 灯塔企微登录

## 浏览器扫码

启用任一扫码入口后，未登录用户访问灯塔首页会先看到登录方式。使用比亚迪集团账号的员工走集团 IAM，使用比亚迪汽车账号的经销商走汽车企微官方授权。OA 登录仍在同一页面。

### 比亚迪汽车经销商

1. 在汽车企微自建应用的后台，将正式灯塔域名设为 OAuth 可信域名或 Web 网页授权回调域名，并将应用可见范围限定为试点成员。扫码回调使用现有 `LIGHTHOUSE_ORIGIN` 下的 `/auth/wecom/auto/scan/callback`。企微 API 沿用灯塔现有服务端出口配置。[企业微信 Web 登录](https://developer.work.weixin.qq.com/document/path/98152)
2. 在私有应用环境文件中配置汽车企微的 `WECOM_AUTO_CORP_ID`、`WECOM_AUTO_AGENT_ID`、`WECOM_AUTO_SECRET`，设置 `WECOM_AUTO_SCAN_ENABLED=true`，按现有部署流程重建应用容器。`WECOM_AUTO_ENABLED` 单独控制工作台入口。
3. 在桌面无痕窗口打开灯塔正式地址，选「比亚迪汽车经销商 · 企微扫码」。使用试点成员的比亚迪汽车企微扫码并授权，原浏览器应返回灯塔。「我的」应显示普通经销商身份，并可访问自己的路引记录。用范围外成员再试一次，确认没有建立会话。已有工作台试点用户从扫码登录时，核对两种方式对应同一灯塔账号。
4. 用集团员工再验证一次 OA 登录。需要暂停扫码试点时，将 `WECOM_AUTO_SCAN_ENABLED` 改为 `false` 后重建容器，扫码入口及由它建立的会话将停止访问。

### 比亚迪集团员工

集团入口复用灯塔已登记的 IAM 应用。先从灯塔发起 OA 登录，在无痕窗口确认该 IAM 应用已经展示「企业微信扫码」，并用试点员工扫码验证返回的是原有灯塔 IAM 账号。验证通过后，在灯塔私有应用配置中设置 `IAM_WECOM_SCAN_ENABLED=true` 并重建容器。用户点击集团员工扫码入口后，在集团统一登录页选择企微扫码。

当前正式站发起的 IAM 页面仅显示账号登录，集团扫码开关应保持关闭。集团中台的 `appId/appkey` 可用于验票，现有指南未说明如何把扫码回调票据绑定到发起它的电脑事务。[集团接入指南](https://sefd-aftersales.bydauto.com.cn/r/workspace-mu7uz523/wecom-login-guide/)

## 比亚迪汽车企微工作台

从比亚迪汽车企微工作台点击「去灯塔」时，灯塔发起静默网页授权。后台用本应用的凭据取得成员身份并读取成员资料。读取成功且成员已激活，才会开通普通经销商账号。应用可见范围以企微管理后台为准。经销商可以浏览平台、查阅已公开发布的知识和使用路引。集团员工的企微工作台接入由同一需求单跟踪。[需求 #76](https://github.com/KeithChen51/Lantern/issues/76) · [官方网页授权](https://developer.work.weixin.qq.com/document/path/91022) · [官方读取成员](https://developer.work.weixin.qq.com/document/path/90196)

使用已配置 IAM 的 HTTPS 灯塔站点。在应用后台登记同一个站点域名为网页授权可信域名，并按企业配置登记灯塔服务端的可信出口 IP。「去灯塔」按钮使用 `https://<灯塔域名>/auth/wecom/auto/start`，回调固定为 `https://<灯塔域名>/auth/wecom/auto/callback`。默认进入灯塔首页，如需指定站内业务页，可为入口增加 URL 编码后的 `returnTo`。用户需能从企微客户端访问灯塔，灯塔服务端需能访问 `qyapi.weixin.qq.com`。

在私有应用运行配置中设置以下变量。使用比亚迪汽车企业的 CorpID 和灯塔自建应用的 AgentId、Secret。

```dotenv
WECOM_AUTO_ENABLED=true
WECOM_AUTO_CORP_ID=
WECOM_AUTO_AGENT_ID=
WECOM_AUTO_SECRET=
```

浏览器扫码和工作台使用同一套用户表、身份映射表和会话记录表。灯塔以企业和成员 ID 关联经销商用户，并每隔最多五分钟在有请求时复查成员的可见范围及激活状态。绝对会话期八小时，空闲期一小时。设置 `WECOM_AUTO_ENABLED=false` 并重新加载应用配置可关闭工作台入口及从工作台建立的经销商会话。

内网验收时，先用可见范围内的试点成员打开工作台应用，确认「我的」页面显示经销商身份，可以查阅已公开发布的资料并访问自己的路引对话。再用范围外成员验证拒绝访问。移出已登录成员并等待下一次范围复查，验证会话失效。检查同一浏览器切换 IAM 与企微入口时的账号和权限，以及移动端和桌面企微内的回调、加载和退出。记录结果时只保留脱敏状态。

## 使用现有正式地址试点

适用于已运行 `AUTH_MODE=iam` 的 HTTPS 正式站点。工作台入口和回调都使用现有 `LIGHTHOUSE_ORIGIN`，沿用该站点当前的网关路由。

1. 在比亚迪汽车企微后台登记正式站域名，将「去灯塔」设为正式站的 `/auth/wecom/auto/start`，并把应用可见范围限定为试点成员。确认灯塔访问企微 API 所用的出口 IP 已登记。
2. 按[现有生产环境升级流程](production-environments.md)部署含企微入口的交付版本，先以 `WECOM_AUTO_ENABLED=false` 启动。在正式地址用员工账号验证 IAM 登录及原有业务入口。
3. 在现有 `APP_ENV_FILE` 指向的私有运行文件中填入汽车企微应用配置，将 `WECOM_AUTO_ENABLED` 改为 `true`。使用现有生产 Compose 项目、控制文件和 Compose 配置重建应用容器。标准模板的应用服务名为 `app`，对应 Compose 子命令为 `up -d --no-deps --pull never --force-recreate app`。
4. 从汽车企微工作台用试点成员和范围外成员分别验收，同时复核员工 IAM 登录。若需要暂停试点，将 `WECOM_AUTO_ENABLED` 改为 `false`，用同一 Compose 项目再次重建应用容器。

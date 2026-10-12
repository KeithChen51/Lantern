# HTTP 测试环境的后台登录

后台登录和退出使用服务端运行时变量 `ADMIN_COOKIE_SECURE`。未设置或非精确的 `false` 值均开启 Secure；只有 `ADMIN_COOKIE_SECURE=false` 允许 HTTP Cookie。本地 HTTP 开发同样需要此配置。HTTPS 环境保持默认或设置 `true`。

保持 `NODE_ENV=production`，不要用 development 运行生产构建。不要将此变量放入 next.config 的 env 或使用 NEXT_PUBLIC_ 前缀。

## 内网更新

1. 将修复源码同步到内网工作分支，按既有流程汇入 dev，运行仓库 Jenkinsfile 构建镜像；不要修改编译后的 JS。
2. 在 HTTP 测试部署的运行环境中加入 `ADMIN_COOKIE_SECURE=false`。保留已有密码、会话密钥及其他配置，不要用 `.env.example` 覆盖真实 `.env`。
3. 确认变量实际进入容器。Compose 的 `.env` 默认用于插值，并不自动将所有变量传给容器。若已配置 `env_file`，修改它引用的文件；否则在已有服务的 `environment` 中添加：

   ```yaml
   ADMIN_COOKIE_SECURE: "${ADMIN_COOKIE_SECURE:-true}"
   ```

   docker run 部署则添加 `-e ADMIN_COOKIE_SECURE=false`。仅作为 docker build 参数传入无效。
4. 使用新镜像重建测试容器（仅 restart 不会更新容器环境变量）。按实际 Compose 服务名操作，不改数据卷。可执行 `docker exec <容器名> printenv ADMIN_COOKIE_SECURE` 确认，避免打印全部含密钥的环境。
5. 浏览器访问 HTTP 后台：登录成功、刷新仍可访问、内容加载正常；退出后刷新应回到登录页。检查登录响应 Cookie 不含 Secure，后续请求携带 Cookie，退出响应设置同名同路径 Cookie 的 Max-Age=0。必要时清除旧 Cookie 后复测。

本修复保留 HttpOnly、SameSite=Lax、Path=/、会话签名和有效期，不迁移数据库。退出沿用浏览器 Cookie 清除行为，不新增服务端会话撤销机制。

HTTP 不提供传输加密，只用于受控测试。HTTPS 部署切回 true 或移除变量，重建容器并确认 Cookie 含 Secure。

## 回退

保留更新前提交、镜像摘要和运行配置。需要回退时恢复原镜像及配置；HTTP 后台将恢复原先无法保持登录的限制。本改动不涉及数据回滚。

# DSH 接入

先按[通用接入说明](setup-other-hosts.md)完成安装与员工设备授权。将 Skill 安装到 `$DSH_HOME/skills/lighthouse-hermit`，未设置 `DSH_HOME` 时使用用户主目录下的 `.dsh/skills/lighthouse-hermit`。

把 [DSH 配置模板](../assets/dsh.cordis.patch.yml)复制到本机配置位置，替换 `NODE_EXECUTABLE`、`CLIENT_ABSOLUTE_PATH`、`LIGHTHOUSE_HTTPS_ORIGIN` 三个值。Windows 的路径可以写成 `C:/...`，含空格的路径作为一个 YAML 字符串保留。

按当前 DSH profile 合并模板中的 `insert` 项。桌面版通常使用 `desktop`，Web 使用 `web`。持久配置位置是 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`，未设置 `DSH_HOME` 时使用用户主目录下的 `.dsh`。保留已有条目，并为灯塔连接使用唯一条目 ID 和 `serverName`。

支持命令行启动的 DSH 可先用一次性 overlay 验证，将路径替换为处理好占位值后的配置文件绝对路径。

```sh
dsh web --patch "/absolute/lighthouse.cordis.yml"
```

让当前宿主确认 MCP 配置已生效，必要时按它的提示重载。DSH 的工具通常带有 `mcp__lighthouse__` 前缀。Skill 按 DSH 的原生 Skill 安装入口加载，连接成功后在一条新会话中调用本 Skill 验证。

按[验收步骤](setup-other-hosts.md#验证能否使用)验证搜索、按版本读取和更新。

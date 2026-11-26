# 安装与连接

用户从灯塔「我的」复制的安装提示词会提供 HTTPS 站点源地址和同源安装包地址。安装包包含 `lighthouse-hermit/` 和 `client/lighthouse.mjs`。按宿主的原生安装方式把 Skill 放入发现目录，把客户端保存到稳定位置，并记录客户端绝对路径。Skill 更新和 MCP 注册都应保留宿主已有配置。

## 首次授权

客户端需要 Node.js 20.9 及以上、到灯塔 HTTPS 站点的网络访问和当前系统用户可用的安全凭据存储。Windows 使用 DPAPI，macOS 使用钥匙串与系统 Swift，Linux 使用 `secret-tool` 与用户 Secret Service。优先使用宿主已提供的受支持 Node 运行环境。

将下面的客户端路径和源地址替换为安装提示词与本机安装位置的实际值。源地址仅包含 `https://`、主机和可选端口。

```sh
node "/absolute/client/lighthouse.mjs" --server "https://knowledge.example" auth status
```

状态需要授权时运行登录命令，将返回的验证网址和用户码交给用户在灯塔浏览器中完成批准。保留运行中的登录进程，等待授权结果，再重查状态。

```sh
node "/absolute/client/lighthouse.mjs" --server "https://knowledge.example" auth login
```

灯塔员工和比亚迪汽车经销商可以用各自的灯塔账号批准授权。经销商可用企微扫码登录，或在已登录灯塔的企微工作台浏览器中打开工具显示的验证网址，输入授权码。批准前核对当前账号和工具名称。经销商读取的范围与灯塔网页一致，为对经销商开放的已发布资料。

CLI 和 MCP 共用当前系统用户的安全凭据存储，连接配置只保存源地址和启动参数。已有凭据时，先用 `auth status` 核对账号。切换账号时在灯塔登录所需账号后重新授权。凭据过期或撤销时重新授权。测试站点使用 HTTP 时，先请部署方提供 HTTPS 入口。

## 注册 MCP 或使用 CLI

使用宿主提供的 Skill 安装和 MCP 注册入口。stdio 启动参数为以下独立字段，路径替换为实际绝对路径。

```json
{
  "command": "NODE_EXECUTABLE",
  "args": [
    "CLIENT_ABSOLUTE_PATH",
    "--server",
    "LIGHTHOUSE_HTTPS_ORIGIN",
    "mcp",
    "serve"
  ]
}
```

工具注册通常需要宿主重新加载连接。宿主仅支持终端时，用同一客户端按需执行查询与读取。

```sh
node "/absolute/client/lighthouse.mjs" --server "https://knowledge.example" knowledge search --query "主动服务" --limit 5
node "/absolute/client/lighthouse.mjs" --server "https://knowledge.example" knowledge outline --resource-id RESOURCE_ID --version-id VERSION_ID
node "/absolute/client/lighthouse.mjs" --server "https://knowledge.example" knowledge read --resource-id RESOURCE_ID --version-id VERSION_ID --start-line 1 --line-count 40
```

从搜索结果复制真实资源 ID 和版本 ID，按章节实际行号读取。具体参数以客户端 `--help` 与宿主发现的工具 schema 为准。

## 验证能否使用

1. 用客户端 `auth status` 确认服务端认可当前身份，检查宿主发现了 `knowledge_search` 和 `knowledge_read`。
2. 提问“用灯塔资料解释主动服务，并给一个我下一班可以做的动作”。搜索相关资料，用实际返回的版本 ID 读取相关正文，再给出处和建议。
3. 从回答中的引用回读相同资源与版本，核对支持论点的章节或行号。用户追问时继续读取同一版本。
4. 需要验证更新时，请资料维护者正常发布并生效一个新版本，再重新搜索。当前查询应返回新适用版本，历史引用按原版本核对。

报告实际完成的授权、工具发现、检索和原文核对结果。遇到失败记录错误码及发生步骤，按宿主提示恢复。宿主没有注册入口时，给出需要管理员导入的配置和材料位置。

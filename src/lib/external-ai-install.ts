export const EXTERNAL_AI_INSTALL_PATH = "/install/lighthouse-ai.zip";

export function buildExternalAiInstallPrompt(origin: string): string | undefined {
  let site: URL;
  try {
    site = new URL(origin);
  } catch {
    return undefined;
  }
  if (site.protocol !== "https:" || site.origin !== origin) return undefined;

  const download = new URL(EXTERNAL_AI_INSTALL_PATH, site).href;
  return [
    "请在当前 AI 客户端安装「灯塔｜路引」Skill 和灯塔只读知识 MCP。",
    "",
    `灯塔站点 ${site.origin}`,
    `安装包 ${download}`,
    "",
    "1. 确认当前客户端能安装 Skill、注册 stdio MCP，并有 Node.js 20.9 或更新版本。通过上面的 HTTPS 链接下载 ZIP，在临时目录解压。安装 lighthouse-hermit 整个目录到当前客户端的用户级 Skill 目录，将 client/lighthouse.mjs 放到该客户端可持久访问的位置。",
    "2. DSH 按 Skill 内的 references/setup-dsh.md 配置。其他客户端按 references/setup-other-hosts.md 使用宿主自己的注册方式。保留现有配置。已有同一灯塔站点的连接时复用它。需要新增时，用 lighthouse 或其他未占用的名称注册，command 使用 Node.js 的绝对路径，args 如下。把客户端脚本路径替换为实际绝对路径。",
    JSON.stringify(["<client/lighthouse.mjs 的绝对路径>", "--server", site.origin, "mcp", "serve"]),
    "3. 用相同的 Node.js、脚本和 --server 参数执行 auth status。需要授权时运行 auth login --open，请我在灯塔浏览器页面完成确认。登录和 MCP 使用同一套本机凭据，配置里不填写账号密码或令牌。",
    "4. 按客户端要求重新加载 Skill 和 MCP。确认能发现 knowledge_search 与 knowledge_read，再搜索「精诚服务」并按结果的版本读取一段原文。告诉我哪些步骤已验证，以及是否需要我重新打开客户端。",
    "",
    "完成后，用「灯塔｜路引」Skill 帮我理解精诚服务的价值观，并给出资料出处。",
  ].join("\n");
}

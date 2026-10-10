import { access, readFile } from "node:fs/promises";
import path from "node:path";

export const DSH_SUPPORTED_VERSION = "0.2.0-rc.2";

/** Default to the deployment-local carrier; an explicit absolute path supports development. */
export async function verifyDshInstallation(root = process.env.HERMIT_DSH_ROOT || path.join(process.cwd(), "runtime", "hermit-dsh")) {
  if (!path.isAbsolute(root)) throw new Error("HERMIT_DSH_ROOT 必须是绝对路径；部署包默认使用 runtime/hermit-dsh。");
  let bundled = false;
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "runtime-manifest.json"), "utf8"));
    if (manifest.format !== 1 || manifest.dshVersion !== DSH_SUPPORTED_VERSION) throw new Error("路引内置运行时版本不匹配，请重新构建部署包。");
    if (manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error("路引运行时与当前操作系统/架构不匹配，请在目标平台构建。");
    bundled = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const modules = bundled ? {
    sdk: "node_modules/@deepseek-ai/dsh-sdk-client",
    protocol: "node_modules/@deepseek-ai/dsh-sdk-protocol",
    tools: "node_modules/@deepseek-ai/dsh-tools",
    provider: "node_modules/@deepseek-ai/dsh-llm-pi-ai",
  } : {
    sdk: "packages/sdk/client", protocol: "packages/sdk/protocol",
    tools: "packages/core/tools", provider: "packages/llm/llm-pi-ai",
  };
  for (const relative of Object.values(modules)) {
    const metadata = JSON.parse(await readFile(path.join(root, relative, "package.json"), "utf8"));
    if (metadata.version !== DSH_SUPPORTED_VERSION) throw new Error(`路引适配器需要 DSH ${DSH_SUPPORTED_VERSION} 的 SDK 和运行时。`);
  }
  if (!bundled) {
    const cli = JSON.parse(await readFile(path.join(root, "apps/cli/package.json"), "utf8"));
    if (cli.version !== DSH_SUPPORTED_VERSION) throw new Error("DSH CLI 与适配器版本不匹配。");
  }
  const sdkPath = path.join(root, modules.sdk, "lib/index.js");
  const bin = path.join(root, bundled ? "launcher.mjs" : "apps/cli/lib/bin.js");
  const toolsPath = path.join(root, modules.tools, "lib/index.js");
  const providerPath = path.join(root, modules.provider, "lib/index.js");
  await Promise.all([sdkPath, bin, toolsPath, providerPath].map(file => access(file)));
  return { root, sdkPath, bin, toolsPath, providerPath, bundled };
}

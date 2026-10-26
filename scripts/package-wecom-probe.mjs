import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "output", "wecom-pilot");
const sources = ["scripts/package-wecom-probe.mjs", "scripts/wecom-ticket-probe.ts", "src/modules/auth/wecom-ticket-client.ts", "src/modules/auth/wecom-ticket-client.test.ts", "src/modules/auth/wecom-ticket-probe.ts", "src/modules/auth/wecom-ticket-probe.test.ts", "src/modules/auth/access-types.ts", "src/shared/errors/index.ts", "deploy/intranet/environments/wecom-probe.env.example", "docs/deployment/lighthouse-wecom-pilot.md"];
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
if (git("status", "--porcelain", "--", ...sources)) throw new Error("Commit diagnostic inputs before packaging; no output was changed.");
const sourceRevision = git("rev-parse", "HEAD");
await mkdir(output, { recursive: true });
const expected = new Set(["wecom-ticket-probe.cjs", "wecom-probe.env.example", "README.md", "AI更新指南.md", "SOURCE_SHA256SUMS", "SHA256SUMS", "manifest.json"]);
if ((await readdir(output, { withFileTypes: true })).some(entry => !entry.isFile() || !expected.has(entry.name))) {
  throw new Error("Diagnostic output contains unrelated files. Use a clean output directory; no files were removed.");
}
await build({ entryPoints: [path.join(root, "scripts/wecom-ticket-probe.ts")], bundle: true, platform: "node", target: "node20", format: "cjs", outfile: path.join(output, "wecom-ticket-probe.cjs"), sourcemap: false, legalComments: "none" });
await copyFile(path.join(root, "deploy/intranet/environments/wecom-probe.env.example"), path.join(output, "wecom-probe.env.example"));
await copyFile(path.join(root, "docs/deployment/lighthouse-wecom-pilot.md"), path.join(output, "README.md"));
await writeFile(path.join(output, "AI更新指南.md"), `# 内网 AI：企微验票诊断工具使用指南\n\n本包是 Issue #76 的独立诊断工具，不是灯塔应用源码或 main 交付版本。请先阅读 README.md 与 manifest.json。\n\n- 工具来源提交：${sourceRevision}。\n- 应用版本/main 发布 SHA/源码 ZIP：不适用，本包不包含应用源码 ZIP，不升级应用。\n- 上一诊断工具交付基线：首次形成；内网现有应用版本未知且无需改变。\n- 已验证：147 项相关合成测试、ESLint、项目 TypeScript、单文件打包及模拟 Node 执行。\n- 未验证：真实内网网络、凭据、企微回调、工作台免登与完整扫码登录。\n\n## 执行边界\n\n不要同步本包到现有灯塔源码树，不要更改 Git、IAM、角色、数据库、上传、挂载或运行容器。无需数据库迁移和 npm 安装。真实凭据由内网运维写在包目录外的私有 env 文件，仅按 README 在受控网络执行诊断。默认检查不联网；只有 --verify-once 才消费测试票据，不会创建灯塔会话。\n\n先核对 SHA256SUMS 与 manifest 的逐文件哈希；SOURCE_SHA256SUMS 仅追溯构建输入，并非要求接收方覆盖这些源文件。不要删除包中不存在的内网文件，不要把私有配置、响应或个人资料加入 Git。诊断无需覆盖旧工具；保留原工具即可回退，应用与数据保持原状。\n\n完成后只报告工具提交与哈希、执行时间、脱敏 JSON 结果、已执行/未执行项及待确认的回调字段。不得把验票成功写成已部署、已完成登录或工作台免登。若后续要更新灯塔应用，须另走原工作分支、dev/main 评估及内网部署流程。\n`);
const sourceChecksums = [];
for (const file of sources) {
  const bytes = execFileSync("git", ["show", `${sourceRevision}:${file}`], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  sourceChecksums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${file}`);
}
await writeFile(path.join(output, "SOURCE_SHA256SUMS"), `${sourceChecksums.join("\n")}\n`);
const files = [];
for (const file of ["wecom-ticket-probe.cjs", "wecom-probe.env.example", "README.md", "AI更新指南.md", "SOURCE_SHA256SUMS"]) {
  const bytes = await readFile(path.join(output, file));
  files.push({ file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
const manifest = `${JSON.stringify({ artifact: "wecom-ticket-diagnostic", applicationRelease: false, sourceRevision, issue: 76, minimumNode: "20.9.0", files }, null, 2)}\n`;
await writeFile(path.join(output, "manifest.json"), manifest);
await writeFile(path.join(output, "SHA256SUMS"), `${[...files.map(file => `${file.sha256}  ${file.file}`), `${createHash("sha256").update(manifest).digest("hex")}  manifest.json`].join("\n")}\n`);
process.stdout.write(`${output}\n`);

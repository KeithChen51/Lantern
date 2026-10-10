import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DSH_SUPPORTED_VERSION, verifyDshInstallation } from "./dsh-installation";
const roots: string[] = [];
async function carrier(platform = process.platform) {
  const root = await mkdtemp(path.join(tmpdir(), "lantern-carrier-test-")); roots.push(root);
  await writeFile(path.join(root, "runtime-manifest.json"), JSON.stringify({ format: 1, dshVersion: DSH_SUPPORTED_VERSION, platform, arch: process.arch }));
  for (const name of ["sdk-client", "sdk-protocol", "tools", "llm-pi-ai"]) {
    const dir = path.join(root, "node_modules", "@deepseek-ai", `dsh-${name}`);
    await mkdir(path.join(dir, "lib"), { recursive: true });
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ version: DSH_SUPPORTED_VERSION }));
    await writeFile(path.join(dir, "lib/index.js"), "export {};");
  }
  await writeFile(path.join(root, "launcher.mjs"), ""); return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
describe("deployment-local DSH installation", () => {
  it("resolves the carrier without any external checkout", async () => {
    const root = await carrier(); const result = await verifyDshInstallation(root);
    expect(result.bundled).toBe(true); expect(result.bin).toBe(path.join(root, "launcher.mjs"));
    expect(result.toolsPath.startsWith(root)).toBe(true);
  });
  it("fails before launch when the build platform differs", async () => {
    const root = await carrier(process.platform === "linux" ? "win32" : "linux");
    await expect(verifyDshInstallation(root)).rejects.toThrow("操作系统/架构");
  });
  it("does not silently fall back from a corrupt carrier manifest", async () => {
    const root = await carrier(); await writeFile(path.join(root, "runtime-manifest.json"), "{}");
    await expect(verifyDshInstallation(root)).rejects.toThrow("版本不匹配");
  });
  it("rejects missing runtime modules", async () => {
    const root = await carrier(); await rm(path.join(root, "launcher.mjs"));
    await expect(verifyDshInstallation(root)).rejects.toThrow();
  });
});

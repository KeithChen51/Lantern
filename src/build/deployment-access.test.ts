import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("deployment access safeguards", () => {
  it("excludes environment files from DSH runtime assets, including explicitly declared files", async () => {
    const root = mkdtempSync(join(tmpdir(), "lighthouse-carrier-env-")); roots.push(root);
    const source = join(root, "source"), target = join(root, "output");
    mkdirSync(join(source, "lib"), { recursive: true });
    writeFileSync(join(source, "lib", "index.js"), "export const ready = true;");
    for (const file of [".env", ".env.production", ".env.local", ".env.runtime", ".env.json"]) writeFileSync(join(source, "lib", file), "PRIVATE_TEST_VALUE=redacted");
    // The exported copier runs the real production file-selection logic.
    const moduleUrl = pathToFileURL(resolve("scripts/package-hermit-runtime.mjs")).href;
    execFileSync(process.execPath, ["--input-type=module", "-e", `import { copyRuntimeTree } from ${JSON.stringify(moduleUrl)}; copyRuntimeTree(${JSON.stringify(source)}, ${JSON.stringify(target)}, ${JSON.stringify(source)}, new Set(["lib/.env.production", "lib/.env.json"]));`], { windowsHide: true });
    expect(readFileSync(join(target, "lib", "index.js"), "utf8")).toContain("ready");
    for (const file of [".env", ".env.production", ".env.local", ".env.runtime", ".env.json"]) expect(existsSync(join(target, "lib", file))).toBe(false);
  });

  for (const dockerfile of ["Dockerfile.hermit", "deploy/intranet/Dockerfile"]) {
    it(`${dockerfile} checks readiness and rejects failures and login redirects`, async () => {
      const body = readFileSync(dockerfile, "utf8");
      const command = body.match(/^HEALTHCHECK[^\r\n]* CMD node -e "([^\r\n]+)"$/m)?.[1];
      expect(command).toBeTruthy();
      const requests: string[] = [];
      let status = 200;
      const server = createServer((request, response) => {
        requests.push(request.url || "");
        response.statusCode = status;
        if (status === 302) response.setHeader("Location", "/login");
        response.end("health fixture");
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("No test listener");
        const script = command!.replace("http://127.0.0.1:3000", `http://127.0.0.1:${address.port}`);
        const run = () => new Promise<number | null>((resolve, reject) => {
          const child = spawn(process.execPath, ["-e", script], { stdio: "ignore", windowsHide: true });
          child.once("error", reject); child.once("exit", resolve);
        });
        expect(await run()).toBe(0);
        status = 503; expect(await run()).toBe(1);
        status = 302; expect(await run()).toBe(1);
        expect(requests).toEqual(["/api/health/ready", "/api/health/ready", "/api/health/ready"]);
      } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    });
  }
});

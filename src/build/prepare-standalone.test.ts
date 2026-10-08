import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyStandaloneAssets } from "./prepare-standalone";

function createTempProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lantern-standalone-"));
  fs.mkdirSync(path.join(projectRoot, ".next", "standalone"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, ".next", "static", "chunks"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "public"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, ".next", "standalone", "server.js"), "server");
  fs.writeFileSync(path.join(projectRoot, ".next", "static", "chunks", "app.js"), "chunk");
  fs.writeFileSync(path.join(projectRoot, "public", "icon.txt"), "icon");
  return projectRoot;
}

describe("prepare standalone assets", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses deployment output without a required DSH carrier", () => {
    vi.stubEnv("HERMIT_BUNDLE_REQUIRED", "true");
    expect(() => copyStandaloneAssets(createTempProject())).toThrow("DSH runtime missing");
  });

  it("copies a matching carrier and rejects a foreign platform", () => {
    const projectRoot = createTempProject();
    const runtime = path.join(projectRoot, "runtime", "hermit-dsh");
    fs.mkdirSync(runtime, { recursive: true });
    const manifest = { format: 1, dshVersion: "0.2.0-rc.2", platform: process.platform, arch: process.arch };
    fs.writeFileSync(path.join(runtime, "runtime-manifest.json"), JSON.stringify(manifest));
    fs.writeFileSync(path.join(runtime, "launcher.mjs"), "carrier");
    copyStandaloneAssets(projectRoot);
    expect(fs.readFileSync(path.join(projectRoot, ".next", "standalone", "runtime", "hermit-dsh", "launcher.mjs"), "utf8")).toBe("carrier");
    fs.writeFileSync(path.join(runtime, "runtime-manifest.json"), JSON.stringify({ ...manifest, platform: "foreign" }));
    expect(() => copyStandaloneAssets(projectRoot)).toThrow("version/platform");
  });
  it("copies public and Next static assets into the standalone server output", () => {
    const projectRoot = createTempProject();

    copyStandaloneAssets(projectRoot);

    expect(
      fs.readFileSync(path.join(projectRoot, ".next", "standalone", ".next", "static", "chunks", "app.js"), "utf8"),
    ).toBe("chunk");
    expect(fs.readFileSync(path.join(projectRoot, ".next", "standalone", "public", "icon.txt"), "utf8")).toBe(
      "icon",
    );
  });
});

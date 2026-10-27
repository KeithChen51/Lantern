import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentVersion, releases } from "./releases";

function syncFixture(versions: string[]) {
  const root = mkdtempSync(join(tmpdir(), "lighthouse-release-test-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src/content"), { recursive: true });
    copyFileSync("scripts/sync-releases.mjs", join(root, "scripts/sync-releases.mjs"));
    copyFileSync("scripts/release-version.mjs", join(root, "scripts/release-version.mjs"));
    writeFileSync(join(root, "src/content/releases.json"), JSON.stringify(versions.map((version) => ({
      version, date: "2026-10-26", title: "Test release", summary: "Test summary",
      changes: [{ type: "Test", items: ["Test change"] }],
    }))));
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.0.0" }));
    writeFileSync(join(root, "package-lock.json"), JSON.stringify({ version: "0.0.0", packages: { "": { version: "0.0.0" } } }));
    const result = spawnSync(process.execPath, [join(root, "scripts/sync-releases.mjs")], { encoding: "utf8" });
    return {
      status: result.status, error: result.stderr,
      package: JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
      lock: JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("release delivery contract", () => {
  it("keeps package metadata and generated changelog consistent with displayed releases", () => {
    expect(() => execFileSync(process.execPath, ["scripts/sync-releases.mjs", "--check"])).not.toThrow();
    expect(JSON.parse(readFileSync("package.json", "utf8")).version).toBe(currentVersion);
    expect(releases.at(-1)?.version).toBe("1.0.0");
  });

  it("synchronizes a prerelease version into both package and lock metadata", () => {
    const result = syncFixture(["1.3.3-beta.1", "1.3.2"]);
    expect(result.status, result.error).toBe(0);
    expect(result.package.version).toBe("1.3.3-beta.1");
    expect(result.lock.version).toBe("1.3.3-beta.1");
    expect(result.lock.packages[""].version).toBe("1.3.3-beta.1");
  });

  it("orders stable, textual and numeric prerelease identifiers correctly", () => {
    const result = syncFixture([
      "1.3.3", "1.3.3-rc.1", "1.3.3-beta.10", "1.3.3-beta.2", "1.3.3-beta.1",
      "1.3.3-beta", "1.3.3-alpha.1", "1.3.3-alpha", "1.3.3-10", "1.3.3-2", "1.3.2",
    ]);
    expect(result.status, result.error).toBe(0);
  });

  it.each(["1.3", "01.3.3", "1.3.3-", "1.3.3-beta..1", "1.3.3-beta.01", "1.3.3-beta_1", "1.3.3-beta.1\n"])("rejects malformed version %s", (version) => {
    expect(syncFixture([version]).status).not.toBe(0);
  });

  it.each([
    ["1.3.3-beta.1", "1.3.3"],
    ["1.3.3-beta.2", "1.3.3-beta.10"],
    ["1.3.3-beta.1", "1.3.3-beta.1"],
  ])("rejects non-descending versions %s / %s", (first, second) => {
    expect(syncFixture([first, second]).error).toContain("Releases must be unique and newest first.");
  });
});

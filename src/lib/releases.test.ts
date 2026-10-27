import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentVersion, getUserFacingReleases, latestUserFacingVersion, releases } from "./releases";

function syncFixture(versions: string[], overrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "lighthouse-release-test-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src/content"), { recursive: true });
    copyFileSync("scripts/sync-releases.mjs", join(root, "scripts/sync-releases.mjs"));
    copyFileSync("scripts/release-version.mjs", join(root, "scripts/release-version.mjs"));
    writeFileSync(join(root, "src/content/releases.json"), JSON.stringify(versions.map((version) => ({
      version, date: "2026-10-26", title: "Test release", summary: "Test summary",
      changes: [{ type: "Test", items: ["Test change"] }],
      userFacing: { title: "User release", summary: "User summary", changes: [{ type: "Feature", items: ["User change"] }] },
      ...overrides,
    }))));
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.0.0" }));
    writeFileSync(join(root, "package-lock.json"), JSON.stringify({ version: "0.0.0", packages: { "": { version: "0.0.0" } } }));
    const result = spawnSync(process.execPath, [join(root, "scripts/sync-releases.mjs")], { encoding: "utf8" });
    return {
      status: result.status, error: result.stderr,
      package: JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
      lock: JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")),
      changelog: result.status === 0 ? readFileSync(join(root, "CHANGELOG.md"), "utf8") : "",
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

  it("keeps the full internal changelog for a maintenance-only release", () => {
    const result = syncFixture(["1.3.5"], { userFacing: null });
    expect(result.status, result.error).toBe(0);
    expect(result.package.version).toBe("1.3.5");
    expect(result.changelog).toContain("Test change");
    expect(result.changelog).not.toContain("User change");
  });

  it("requires an explicit choice of user-facing notes instead of falling back to internal details", () => {
    expect(syncFixture(["1.3.5"], { userFacing: undefined }).error).toContain("explicitly define userFacing");
    for (const userFacing of [{}, { title: "Title", summary: "Summary", changes: [] }, { title: "Title", summary: "Summary", changes: [{ type: "Feature", items: [""] }] }]) {
      expect(syncFixture(["1.3.5"], { userFacing }).status).not.toBe(0);
    }
  });

  it("projects only user notes and skips maintenance releases without changing their order", () => {
    const internal = { date: "2026-10-27", title: "Internal title", summary: "Internal summary", changes: [{ type: "Deployment", items: ["Jenkinsfile details"] }] };
    const userFacing = { title: "Reading improvement", summary: "Clearer references", changes: [{ type: "Reading", items: ["Open a reference in place"] }] };
    const visible = getUserFacingReleases([
      { ...internal, version: "1.3.6", userFacing: null },
      { ...internal, version: "1.3.5", userFacing },
      { ...internal, version: "1.3.4", userFacing },
    ]);
    expect(visible.map(release => release.version)).toEqual(["1.3.5", "1.3.4"]);
    expect(visible[0]).toEqual({ version: "1.3.5", date: internal.date, ...userFacing });
    expect(JSON.stringify(visible)).not.toContain("Jenkinsfile");
    expect(getUserFacingReleases([{ ...internal, version: "1.3.6", userFacing: null }])).toEqual([]);
    expect(latestUserFacingVersion).toBe(releases[0]?.version);
    expect(releases.some(release => release.version === "1.2.1")).toBe(false);
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

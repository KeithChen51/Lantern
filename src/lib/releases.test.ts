import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { currentVersion, releases } from "./releases";

describe("release delivery contract", () => {
  it("keeps package metadata and generated changelog consistent with displayed releases", () => {
    expect(() => execFileSync(process.execPath, ["scripts/sync-releases.mjs", "--check"])).not.toThrow();
    expect(JSON.parse(readFileSync("package.json", "utf8")).version).toBe(currentVersion);
    expect(releases.at(-1)?.version).toBe("1.0.0");
  });
});

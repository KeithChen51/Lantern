import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
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

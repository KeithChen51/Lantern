import * as fs from "node:fs";
import * as path from "node:path";

function copyDirectory(source: string, destination: string) {
  if (!fs.existsSync(source)) return false;

  fs.rmSync(destination, { recursive: true, force: true });
  copyDirectoryContents(source, destination);
  return true;
}

function copyDirectoryContents(source: string, destination: string) {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

export function copyStandaloneAssets(projectRoot = process.cwd()) {
  const standaloneDir = path.join(projectRoot, ".next", "standalone");
  const standaloneServer = path.join(standaloneDir, "server.js");
  if (!fs.existsSync(standaloneServer)) {
    throw new Error("Next standalone server output was not found. Run next build with output: \"standalone\" first.");
  }

  const staticSource = path.join(projectRoot, ".next", "static");
  const staticDestination = path.join(standaloneDir, ".next", "static");
  if (!copyDirectory(staticSource, staticDestination)) {
    throw new Error("Next static output was not found. Run next build before preparing standalone assets.");
  }

  copyDirectory(path.join(projectRoot, "public"), path.join(standaloneDir, "public"));
}

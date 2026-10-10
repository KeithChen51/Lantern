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
  const runtime = path.join(projectRoot, "runtime", "hermit-dsh");
  const runtimeManifest = path.join(runtime, "runtime-manifest.json");
  if (fs.existsSync(runtimeManifest)) {
    const manifest = JSON.parse(fs.readFileSync(runtimeManifest, "utf8"));
    if (manifest.format !== 1 || manifest.dshVersion !== "0.2.0-rc.2" || manifest.platform !== process.platform || manifest.arch !== process.arch) {
      throw new Error("Bundled DSH version/platform does not match this build host.");
    }
    copyDirectory(runtime, path.join(standaloneDir, "runtime", "hermit-dsh"));
  } else if (process.env.HERMIT_BUNDLE_REQUIRED === "true") {
    throw new Error("DSH runtime missing. Run npm run package:hermit-runtime before the deployment build.");
  }
  const hermitPlugin = path.join(projectRoot, "scripts", "hermit-dsh-plugin.mjs");
  if (fs.existsSync(hermitPlugin)) {
    fs.mkdirSync(path.join(standaloneDir, "scripts"), { recursive: true });
    fs.copyFileSync(hermitPlugin, path.join(standaloneDir, "scripts", "hermit-dsh-plugin.mjs"));
  }
}

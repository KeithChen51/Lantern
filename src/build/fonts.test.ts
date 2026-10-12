import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { verifyFonts } from "../../scripts/check-fonts.mjs";

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

it("verifies every real bundled font declaration and binary", () => {
  expect(verifyFonts(process.cwd())).toBeGreaterThan(0);
});

it("fails when a font is omitted or corrupted in the standalone delivery", () => {
  const root = mkdtempSync(join(tmpdir(), "lantern-fonts-"));
  temporary.push(root);
  mkdirSync(join(root, "public/fonts"), { recursive: true });
  mkdirSync(join(root, "src/app"), { recursive: true });
  mkdirSync(join(root, ".next/standalone/public/fonts"), { recursive: true });
  const bytes = Buffer.from("wOF2fixture");
  writeFileSync(join(root, "public/fonts/manifest.json"), JSON.stringify({ files: [{ path: "fonts/font.woff2", sha256: createHash("sha256").update(bytes).digest("hex") }] }));
  writeFileSync(join(root, "src/app/globals.css"), '@font-face { font-family: "Fixture"; src: url("/fonts/font.woff2"); }');
  expect(() => verifyFonts(root, true)).toThrow();
  const destination = join(root, ".next/standalone/public/fonts/font.woff2");
  writeFileSync(destination, bytes);
  expect(verifyFonts(root, true)).toBe(1);
  writeFileSync(destination, "corrupted");
  expect(() => verifyFonts(root, true)).toThrow("checksum mismatch");
  writeFileSync(destination, bytes);
  const css = join(root, "src/app/globals.css");
  writeFileSync(css, readFileSync(css, "utf8").replace('url(', 'local("Fixture"), url('));
  expect(() => verifyFonts(root, true)).toThrow("locally installed");
});

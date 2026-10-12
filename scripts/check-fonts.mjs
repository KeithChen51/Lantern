import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyFonts(root, standalone = false) {
  const publicRoot = path.join(root, standalone ? '.next/standalone/public' : 'public');
  const manifest = JSON.parse(readFileSync(path.join(root, 'public/fonts/manifest.json'), 'utf8'));
  const css = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(match => match[1]);
  if (!faces.length) throw new Error('No bundled font declarations found.');
  for (const face of faces) {
    if (/local\s*\(/i.test(face)) throw new Error('Brand fonts must use the bundled file, not a locally installed font.');
    const urls = [...face.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]);
    if (!urls.length) throw new Error('Font declaration has no bundled URL.');
    for (const url of urls) {
      if (!url.startsWith('/fonts/') || !manifest.files.some(file => '/' + file.path === url)) {
        throw new Error('Font URL is not in the bundled manifest: ' + url);
      }
    }
  }
  for (const file of manifest.files) {
    const absolute = path.resolve(publicRoot, file.path);
    if (!absolute.startsWith(path.resolve(publicRoot) + path.sep)) throw new Error('Invalid font manifest path.');
    const bytes = readFileSync(absolute);
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('Font asset checksum mismatch: ' + file.path);
    if (/\.(woff2|otf)$/.test(file.path) && !['wOF2', 'OTTO'].includes(bytes.subarray(0, 4).toString('ascii'))) {
      throw new Error('Invalid font binary: ' + file.path);
    }
  }
  return manifest.files.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const standalone = process.argv.includes('--standalone');
  console.log(`Verified ${verifyFonts(root, standalone)} bundled font assets (${standalone ? 'standalone' : 'source'}).`);
}

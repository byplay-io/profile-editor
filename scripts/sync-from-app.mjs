#!/usr/bin/env node
// Copies files the editor shares with the iOS app (byplay-previs-app) into this
// project, so the editor validates, renders and lists exactly what the app does.
//
//   node scripts/sync-from-app.mjs [schema] [naming] [data] [fixtures] [docs] [all] [--optional]
//
// The app repo is expected next to this one; override with APP_DIR=/path/to/byplay-previs-app.
// With --optional, a missing app repo is a warning (keeps the copies already here),
// so the editor still builds on a machine that only has this repo.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = resolve(process.env.APP_DIR ?? join(root, '..', 'byplay-previs-app'));

const args = process.argv.slice(2);
const optional = args.includes('--optional');
let targets = args.filter((a) => !a.startsWith('--'));
if (targets.length === 0 || targets.includes('all')) {
  targets = ['schema', 'naming', 'data', 'fixtures', 'docs'];
}

const tsHeader = (source) =>
  `// Copied verbatim from byplay-previs-app/${source} by \`npm run sync\`.\n` +
  '// Do not edit here: change it in the app repo and re-run the sync.\n\n';

// The app repo is private; this copy is the public spec. Paths in it are the
// app's: its src/production/schema.ts and naming.ts are src/schema.ts and
// src/naming.ts here.
const mdHeader = (source) =>
  `<!-- Copied from byplay-previs-app/${source} by \`npm run sync\`. Do not edit here. -->\n` +
  '<!-- Paths below are the app\'s: src/production/schema.ts and naming.ts are src/schema.ts and src/naming.ts in this repo. -->\n\n';

// [target, source relative to the app repo, destination relative to this repo, kind]
const files = [
  ['schema', 'src/production/schema.ts', 'src/schema.ts', 'ts'],
  ['naming', 'src/production/naming.ts', 'src/naming.ts', 'ts'],
  ['data', 'src/data/camera_data.json', 'src/data/camera_data.json', 'raw'],
  ['data', 'src/data/lens_data.json', 'src/data/lens_data.json', 'raw'],
  ['fixtures', 'docs/fixtures/example.bpprod', 'test/fixtures/example.bpprod', 'raw'],
  ['fixtures', 'docs/fixtures/example.qr-single.txt', 'test/fixtures/example.qr-single.txt', 'raw'],
  ['fixtures', 'docs/fixtures/example.qr-parts.txt', 'test/fixtures/example.qr-parts.txt', 'raw'],
  ['docs', 'docs/production-profile.md', 'docs/production-profile.md', 'md'],
];

let failed = false;
for (const [target, src, dest, kind] of files) {
  if (!targets.includes(target)) continue;
  const from = join(appDir, src);
  const to = join(root, dest);
  if (!existsSync(from)) {
    if (target === 'naming') {
      // Until the app has its renderer, src/naming.ts is our own implementation of the spec.
      console.warn(`skip: app has no ${src} yet, keeping our own ${dest}`);
    } else if (optional && existsSync(to)) {
      console.warn(`skip: ${from} not found, keeping ${dest}`);
    } else {
      console.error(`missing: ${from}`);
      failed = true;
    }
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  if (kind === 'ts') {
    writeFileSync(to, tsHeader(src) + readFileSync(from, 'utf8'));
  } else if (kind === 'md') {
    writeFileSync(to, mdHeader(src) + readFileSync(from, 'utf8'));
  } else {
    copyFileSync(from, to);
  }
  console.log(`synced ${relative(root, to)} <- ${src}`);
}
process.exit(failed ? 1 : 0);

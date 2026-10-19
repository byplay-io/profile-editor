#!/usr/bin/env node
// Turns dist-offline/index.html (the single-file build) into the "use offline"
// download: adds a Content-Security-Policy <meta> that allows exactly the inlined
// script and style (by hash) and no connections, checks that nothing is loaded
// from outside the file, and copies it into dist/ for the worker to serve.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'dist-offline', 'index.html');
const out = join(root, 'dist', 'byplay-profile-editor-offline.html');

let html = readFileSync(src, 'utf8');

const sha = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)];
if (scripts.length === 0) throw new Error('No inline script found in the offline build');
for (const [tag] of scripts) {
  if (/\ssrc=/.test(tag.slice(0, tag.indexOf('>')))) throw new Error(`External script in offline build: ${tag.slice(0, 120)}`);
}

// The favicon is a separate file on the site; inline it here.
const favicon = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
const faviconUri = `data:image/svg+xml,${encodeURIComponent(favicon.replace(/\s+/g, ' ').trim())}`;
html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="${faviconUri}" />`);

// Nothing in the markup may point outside the file (data: URIs are fine).
const markup = html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g, '');
const external = [...markup.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((u) => !u.startsWith('data:') && !u.startsWith('#'));
if (external.length) throw new Error(`Offline build references external files: ${external.join(', ')}`);

const csp = [
  "default-src 'none'",
  `script-src ${scripts.map(([, body]) => sha(body)).join(' ')}`,
  `style-src ${styles.map(([, body]) => sha(body)).join(' ')}`,
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// The CSP must come before anything it governs.
html = html.replace(/<head>/, `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`offline build: ${out} (${(html.length / 1024).toFixed(0)} KB, ${scripts.length} script, ${styles.length} style)`);

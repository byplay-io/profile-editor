# Byplay Previs production profile editor

A static web page for building a production profile (`.bpprod`): capture naming,
slate fields and camera kit for Byplay Previs. It runs entirely in the browser and is
served by a Cloudflare Worker that adds a strict Content-Security-Policy, so nothing typed
into the page can leave it. Format spec: [`docs/production-profile.md`](docs/production-profile.md).

Live at https://profiles.byplay.io.

## Commands

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173 (no CSP; for UI work)
npm test             # vitest: fixtures interop, QR round trips, naming, worker headers
npm run typecheck    # page + worker
npm run build        # dist/ (the site) and dist/byplay-profile-editor-offline.html
npm run worker:dev   # wrangler dev on http://localhost:8787, serving dist/ with the headers
npm run check        # typecheck + test + build
npm run deploy       # check, then wrangler deploy (needs `wrangler login` first)
```

## Hosting

- `wrangler.jsonc` deploys a Worker named `byplay-profile-editor` with `dist/` as static
  assets to https://profiles.byplay.io (a custom domain on the byplay.io zone; the
  Cloudflare account is pinned by `account_id`). The workers.dev URL is off, so that's
  the only address.
- `run_worker_first: true` sends every request, page and asset alike, through
  `worker/index.ts`, which adds the headers from `worker/headers.ts`: the CSP
  (`connect-src 'none'`, `script-src 'self'`, no inline code, no third-party origins),
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, a
  `Permissions-Policy` denying camera, microphone and geolocation, and frame/opener
  isolation. Anything but GET/HEAD gets a 405. There is no KV, D1, R2 or Durable Object,
  and Worker observability is off.
- Check it: `curl -sI https://<host>/` and `curl -sI https://<host>/assets/<file>.js`.

## Offline copy

`npm run build` also makes `dist/byplay-profile-editor-offline.html`, one file with all
script, styles and the font inlined, linked from the page as "Use offline: download this
page". `scripts/finalize-offline.mjs` gives it its own CSP `<meta>` (the inline script and
style allowed by SHA-256 hash, `connect-src 'none'`) and fails the build if the file
references anything outside itself. It works opened from `file://`.

## Files shared with the app

These are copied from the app repo, `byplay-previs-app` (private), expected next to this
one (set `APP_DIR` to override), and never edited here. The copies are committed, so this
repo builds on its own; without the app repo next to it, the build keeps them as they are.

| Here | From the app | Script |
|---|---|---|
| `src/schema.ts` | `src/production/schema.ts` | `npm run sync:schema` |
| `src/naming.ts` | `src/production/naming.ts` | `npm run sync:naming` |
| `src/data/camera_data.json`, `lens_data.json` | `src/data/` | `npm run sync:data` (also runs on every build) |
| `test/fixtures/*` | `docs/fixtures/` | `npm run sync:fixtures` |
| `docs/production-profile.md` | `docs/production-profile.md` | `npm run sync:docs` |

`npm run sync` copies all of them. The naming preview calls the app's own renderer, so it
shows exactly the names devices write.

## Layout

```
worker/          Worker (headers, GET/HEAD only) and its tests
src/app.tsx      shell: start screen, file open/drop, revision and export logic
src/sections/    Production, Naming (chip builder + preview), Slate, Capture, Camera kit, Share (QR, print)
src/template-model.ts  chip builder model; round-trips any template string exactly
src/naming-checks.ts   warnings (unknown tokens, bad formats, colliding names)
src/qr/          base45 (RFC 9285), payload split/join, QR matrices (qrcode, alphanumeric, EC M)
src/profile.ts   new/open/validate/export, readable validation messages, field keys
src/kit.ts       camera and lens database helpers
scripts/         sync-from-app.mjs, finalize-offline.mjs
```

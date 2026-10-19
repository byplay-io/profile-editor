import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, OFFLINE_PATH } from './headers';
import worker from './index';

const assets = {
  fetch: async (req: Request) =>
    new Response(`asset ${new URL(req.url).pathname}`, { headers: { 'Content-Type': 'text/plain' } }),
} as unknown as Fetcher;

const call = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://example.test${path}`, init) as never, { ASSETS: assets });

describe('worker', () => {
  it('adds the security headers to pages and assets', async () => {
    for (const path of ['/', '/assets/index-abc.js', '/assets/index-abc.css', '/missing']) {
      const res = await call(path);
      expect(res.headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
    }
  });

  it('has a CSP that blocks every outgoing connection', () => {
    for (const directive of [
      "default-src 'self'",
      "connect-src 'none'",
      "script-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(CONTENT_SECURITY_POLICY).toContain(directive);
    }
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe');
  });

  it('serves index.html at the root', async () => {
    expect(await (await call('/')).text()).toBe('asset /index.html');
  });

  it('refuses anything but GET and HEAD', async () => {
    const res = await call('/', { method: 'POST', body: 'secret' });
    expect(res.status).toBe(405);
    expect(res.headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
  });

  it('serves the offline copy as a download', async () => {
    const res = await call(OFFLINE_PATH);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment;/);
  });
});

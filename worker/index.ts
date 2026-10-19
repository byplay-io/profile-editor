// Serves the static editor from the assets binding and adds the security headers.
// Runs in front of every asset (run_worker_first in wrangler.jsonc), so the headers
// are on the HTML, the scripts, the styles and the fonts alike. There is no API:
// anything but GET/HEAD is refused.
import { OFFLINE_FILENAME, OFFLINE_PATH, SECURITY_HEADERS } from './headers';

interface Env {
  ASSETS: Fetcher;
}

function secure(response: Response, pathname: string): Response {
  const res = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(name, value);
  }
  if (pathname.startsWith('/assets/') && res.status === 200) {
    // Vite fingerprints these file names.
    res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  if (pathname === OFFLINE_PATH && res.status === 200) {
    res.headers.set('Content-Disposition', `attachment; filename="${OFFLINE_FILENAME}"`);
  }
  return res;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return secure(
        new Response('This site only serves files.\n', {
          status: 405,
          headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
        }),
        url.pathname,
      );
    }
    // Assets use html_handling "none" (no .html redirects), so map the root ourselves.
    const asset = url.pathname === '/' ? new Request(new URL('/index.html', url), request) : request;
    return secure(await env.ASSETS.fetch(asset), url.pathname);
  },
} satisfies ExportedHandler<Env>;

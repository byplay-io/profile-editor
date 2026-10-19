// Security headers for every response. The page is static: everything typed into
// it stays in the browser, and this policy makes that checkable — scripts, styles
// and fonts load only from this origin, and the page can't open any connection
// (fetch, XHR, WebSocket, EventSource, beacons) or submit a form anywhere.

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// The offline copy, served as a download (its inline script carries its own
// hash-based CSP in a <meta> tag, which this origin's CSP would block if shown here).
export const OFFLINE_PATH = '/byplay-profile-editor-offline.html';
export const OFFLINE_FILENAME = 'byplay-profile-editor-offline.html';

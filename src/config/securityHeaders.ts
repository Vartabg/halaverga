// Response headers per route group (docs/voting.md, "Response headers"). Plain module with no path aliases so next.config.ts and
// tests/vote-headers.test.ts both load it. Next applies matching entries in order and the last one wins for the same key, so the
// common group comes first and the API and /results groups override it. There is deliberately no script CSP on the game and no
// Cache-Control or Access-Control-* on /api/:path* or /results: each handler sets its own cache header (a config header would apply to
// the failure and not-set-up answers too, CODE-6) and no route allows cross-origin reads.
export interface HeaderRule { source: string; headers: { key: string; value: string }[] }

const h = (key: string, value: string) => ({ key, value });

export const COMMON_CSP = "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'";
export const API_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";
/** Sent by the results handlers on a successful read only; every other answer of /results and /api/results is no-store. */
export const RESULTS_CACHE = 'public, max-age=0, s-maxage=120';
export const PERMISSIONS = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), browsing-topics=()';

export const securityHeaders: HeaderRule[] = [
  { source: '/(.*)', headers: [
    h('X-Frame-Options', 'DENY'),
    h('X-Content-Type-Options', 'nosniff'),
    h('Referrer-Policy', 'strict-origin-when-cross-origin'),
    h('Cross-Origin-Opener-Policy', 'same-origin'),
    h('Permissions-Policy', PERMISSIONS),
    h('Content-Security-Policy', COMMON_CSP),
  ] },
  { source: '/api/:path*', headers: [
    h('Content-Security-Policy', API_CSP),
    h('Cross-Origin-Resource-Policy', 'same-origin'),
    h('X-Robots-Tag', 'noindex'),
  ] },
  { source: '/results', headers: [
    h('X-Robots-Tag', 'noindex'),
  ] },
];

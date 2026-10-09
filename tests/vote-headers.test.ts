import { describe, expect, it } from 'vitest';
import config from '../next.config';
import { API_CSP, COMMON_CSP, PERMISSIONS, RESULTS_CACHE, securityHeaders } from '../src/config/securityHeaders';

// The three sources in use, matched the way Next matches them (anchored, optional trailing slash). scripts/check-vote-build.mjs
// checks the same groups against the regexes Next really built into .next/routes-manifest.json.
const MATCH: Record<string, RegExp> = { '/(.*)': /^\/.*\/?$/, '/api/:path*': /^\/api(\/.+)?\/?$/, '/results': /^\/results\/?$/ };
function effective(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of securityHeaders) if (MATCH[g.source]?.test(path)) for (const { key, value } of g.headers) out[key.toLowerCase()] = value;
  return out;
}
const at = (path: string, key: string) => effective(path)[key.toLowerCase()];

describe('W1 headers() groups', () => {
  it('has exactly three groups, common first, in override order', () => {
    expect(securityHeaders.map((g) => g.source)).toEqual(['/(.*)', '/api/:path*', '/results']);
    for (const g of securityHeaders) expect(g.source in MATCH).toBe(true);
  });
  it('W1 the common group carries frame, nosniff, referrer, COOP, permissions and the frame-only CSP, exactly', () => {
    const common = Object.fromEntries(securityHeaders[0].headers.map((h) => [h.key, h.value]));
    expect(common).toEqual({
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), browsing-topics=()',
      'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
    });
    expect(PERMISSIONS).toBe(common['Permissions-Policy']);
    expect(COMMON_CSP).toBe(common['Content-Security-Policy']);
  });
  it('the game and pages get the common set and a CSP that cannot break scripts', () => {
    for (const p of ['/', '/privacy', '/privacy/', '/models/a.glb', '/_next/static/x.js']) {
      expect(at(p, 'X-Frame-Options')).toBe('DENY');
      expect(at(p, 'Content-Security-Policy')).toBe(COMMON_CSP);
    }
    expect(COMMON_CSP).not.toMatch(/script-src|default-src|style-src|connect-src|worker-src|img-src/);
    expect(at('/', 'Referrer-Policy')).not.toBe('no-referrer');
  });
  it('W1 the API group overrides the CSP last and adds CORP and noindex on every /api path', () => {
    for (const p of ['/api/vote', '/api/results', '/api/x/y']) {
      expect(at(p, 'Content-Security-Policy')).toBe("default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox");
      expect(at(p, 'Cross-Origin-Resource-Policy')).toBe('same-origin');
      expect(at(p, 'X-Robots-Tag')).toBe('noindex');
      expect(at(p, 'X-Frame-Options')).toBe('DENY');
    }
    expect(API_CSP).toContain("frame-ancestors 'none'");
    expect(at('/', 'Cross-Origin-Resource-Policy')).toBeUndefined();
    expect(at('/apiary', 'Content-Security-Policy')).toBe(COMMON_CSP);
  });
  it('W2 /api/:path* sets no Cache-Control and no CORS header, so each handler decides', () => {
    const api = securityHeaders[1].headers.map((h) => h.key.toLowerCase());
    expect(api.filter((k) => k === 'cache-control' || k.startsWith('access-control-'))).toEqual([]);
    for (const g of securityHeaders) for (const h of g.headers) expect(h.key.toLowerCase().startsWith('access-control-')).toBe(false);
  });
  it('CODE-6 /results has no Cache-Control in the config (its handler sets it per answer: public 120 s for a tally, no-store for every failure); the value has no stale-while-revalidate', () => {
    expect(at('/results', 'Cache-Control')).toBeUndefined(); // a config header would also cover the 502 and 503 pages
    expect(RESULTS_CACHE).toBe('public, max-age=0, s-maxage=120');
    expect(RESULTS_CACHE).not.toMatch(/stale-while-revalidate/);
    expect(at('/results', 'X-Robots-Tag')).toBe('noindex');
    expect(at('/results', 'Content-Security-Policy')).toBe(COMMON_CSP);
    for (const p of ['/', '/privacy', '/api/results', '/results/x', '/resultsx']) expect(at(p, 'Cache-Control')).toBeUndefined();
  });
  it('no group sets a cookie, HSTS, or a game-wide noindex', () => {
    const keys = securityHeaders.flatMap((g) => g.headers.map((h) => h.key.toLowerCase()));
    expect(keys).not.toContain('set-cookie');
    expect(keys).not.toContain('strict-transport-security');
    expect(at('/', 'X-Robots-Tag')).toBeUndefined();
  });
  it('every header key and value is a single line with no duplicate key inside a group', () => {
    for (const g of securityHeaders) {
      const keys = g.headers.map((h) => h.key.toLowerCase());
      expect(new Set(keys).size).toBe(keys.length);
      for (const h of g.headers) expect(`${h.key}${h.value}`).not.toMatch(/[\r\n]/);
    }
  });
});

describe('next.config.ts', () => {
  it('headers() returns the module groups unchanged', async () => {
    expect(await config.headers?.()).toBe(securityHeaders);
  });
  it('W9 images.unoptimized is on, so /_next/image is not served', () => {
    expect(config.images?.unoptimized).toBe(true);
  });
  it('keeps the existing flags', () => {
    expect(config.poweredByHeader).toBe(false);
    expect(config.env?.NEXT_PUBLIC_BUILD_STAMP).toMatch(/^\d{4}-\d{2}-\d{2} · \S+$/);
  });
});

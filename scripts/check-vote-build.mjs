// Run after `next build` (docs/voting.md). Asserts the vote surface exists in the build: both API routes and /results (a route handler,
// so it sets its own Cache-Control per answer) are server entries, /privacy is prerendered static, and /results is not (it must read the
// store at request time). It also asserts that .next/routes-manifest.json carries the response-header groups of
// src/config/securityHeaders.ts, with no Cache-Control on /results there (a config header would also cover its failure pages). Exit 1 on any miss.
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const next = fileURLToPath(new URL('..', import.meta.url)) + '.next/';
const has = (p) => access(next + p).then(() => true, () => false);
const failures = [];
const need = async (p, why) => { if (!(await has(p))) failures.push(`missing .next/${p} (${why})`); };

await need('server/app/api/vote/route.js', 'POST /api/vote, src/app/api/vote/route.ts');
await need('server/app/api/results/route.js', 'GET /api/results, src/app/api/results/route.ts');
await need('server/app/results/route.js', 'GET /results, src/app/results/route.ts');
if (await has('server/app/results/page.js')) failures.push('.next/server/app/results/page.js exists: /results must be a route handler (CODE-6), not a page');
await need('server/app/privacy.html', 'the static /privacy page, src/app/privacy/page.tsx');
if (await has('server/app/results.html')) failures.push('.next/server/app/results.html exists: /results was prerendered, it must render at request time');

const manifest = await readFile(next + 'app-path-routes-manifest.json', 'utf8').then(JSON.parse, () => null);
if (!manifest) failures.push('missing .next/app-path-routes-manifest.json: run `next build` first');
else {
  for (const [entry, route] of [['/api/vote/route', '/api/vote'], ['/api/results/route', '/api/results'], ['/results/route', '/results'], ['/privacy/page', '/privacy']]) {
    if (manifest[entry] !== route) failures.push(`the build has no ${route} (${entry})`);
  }
}

const routes = await readFile(next + 'routes-manifest.json', 'utf8').then(JSON.parse, () => null);
const groups = routes?.headers;
if (!Array.isArray(groups)) failures.push('missing .next/routes-manifest.json headers: next.config.ts headers() was not built');
else {
  const value = (source, key) => groups.filter((g) => g.source === source).flatMap((g) => g.headers).filter((x) => x.key.toLowerCase() === key.toLowerCase()).at(-1)?.value;
  const want = [
    ['/(.*)', 'X-Frame-Options', 'DENY'], ['/(.*)', 'X-Content-Type-Options', 'nosniff'],
    ['/(.*)', 'Referrer-Policy', 'strict-origin-when-cross-origin'], ['/(.*)', 'Cross-Origin-Opener-Policy', 'same-origin'],
    ['/(.*)', 'Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'"],
    ['/api/:path*', 'Content-Security-Policy', "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox"],
    ['/api/:path*', 'Cross-Origin-Resource-Policy', 'same-origin'], ['/api/:path*', 'X-Robots-Tag', 'noindex'],
    ['/results', 'X-Robots-Tag', 'noindex'],
  ];
  for (const [source, key, v] of want) if (value(source, key) !== v) failures.push(`headers ${source} ${key}: want "${v}", built "${value(source, key) ?? 'absent'}"`);
  const order = groups.map((g) => g.source);
  if (order.indexOf('/(.*)') !== 0 || order.indexOf('/api/:path*') < 1) failures.push('header groups are out of order: the common group must come first so /api/:path* and /results override it');
  if (value('/api/:path*', 'Access-Control-Allow-Origin') !== undefined) failures.push('/api/:path* must not set Access-Control-Allow-Origin: nothing allows cross-origin reads');
  for (const source of ['/api/:path*', '/results']) if (value(source, 'Cache-Control') !== undefined) failures.push(`${source} must not set Cache-Control in the config: the handler sets public 120 s for a tally and no-store for every failure (CODE-6)`);
}
const images = await readFile(next + 'images-manifest.json', 'utf8').then(JSON.parse, () => null);
if (images?.images?.unoptimized !== true) failures.push('images.unoptimized is not set in .next/images-manifest.json (next.config.ts)');

if (failures.length) { console.error('Vote build check failed:\n  ' + failures.join('\n  ')); process.exit(1); }
console.log('Vote build: /api/vote, /api/results and /results (route handler) are server entries, /privacy is static, header groups built.');

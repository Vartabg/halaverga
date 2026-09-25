// The vote handler records which build each vote came from (serverBuild = BUILD_STAMP in src/ui/buildInfo.ts). That stamp is a
// literal process.env.NEXT_PUBLIC_BUILD_STAMP inlined at build time, so the built /api/vote server code must carry a real
// "YYYY-MM-DD · sha" stamp, never 'unknown'. Run after `next build` (docs/voting.md, spec M1). Exit 1 on any failure.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const next = root + '.next/';
const entry = 'server/app/api/vote/route.js';
const main = await readFile(next + entry, 'utf8').catch(() => null);
if (main === null) { console.error(`No ${entry} in the build: run \`next build\` first (and check src/app/api/vote/route.ts exists).`); process.exit(1); }
// Turbopack entries load their chunks with R.c("server/chunks/...") (paths relative to .next/); webpack ones with require().
const files = new Set([entry]);
for (const m of main.matchAll(/R\.c\("([^"]+)"\)/g)) files.add(m[1]);
for (const m of main.matchAll(/require\("(\.\.?\/[^"]+)"\)/g)) files.add(new URL(m[1], 'file:///' + entry).pathname.slice(1));
// The traced files catch anything the entry loads indirectly; only the build's own server chunks are scanned.
const trace = await readFile(next + entry + '.nft.json', 'utf8').then(JSON.parse).catch(() => ({ files: [] }));
for (const f of trace.files) {
  const path = new URL(f, 'file:///' + entry).pathname.slice(1);
  if (path.startsWith('server/') && path.endsWith('.js')) files.add(path);
}
// The middle dot may be emitted raw or escaped.
const STAMP = /\d{4}-\d{2}-\d{2} (?:·|\\u00b7|\\xb7|\\u00B7|\\xB7) (?:[0-9a-f]{7,12}|uncommitted)/;
const UNKNOWN = /serverBuild\s*[:=]\s*["'`]unknown["'`]|BUILD_STAMP\s*[:=]\s*["'`]unknown["'`]/;
let stamp = null; const bad = [];
for (const f of files) {
  const body = await readFile(next + f, 'utf8').catch(() => '');
  stamp ??= body.match(STAMP)?.[0] ?? null;
  if (UNKNOWN.test(body)) bad.push(f);
}
console.log(`Vote route build: scanned ${files.size} server files; build stamp ${stamp ? `"${stamp}"` : 'not found'}.`);
if (bad.length) { console.error("The vote route uses 'unknown' as its build stamp in:\n  " + bad.join('\n  ')); process.exit(1); }
if (!stamp) { console.error('The vote route carries no inlined build stamp (expected "YYYY-MM-DD · sha"). Import BUILD_STAMP from src/ui/buildInfo.ts.'); process.exit(1); }

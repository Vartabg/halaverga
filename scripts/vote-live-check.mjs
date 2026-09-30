#!/usr/bin/env node
// DEV TOOL ONLY (spec 12.2). Drives a running production build of the vote over real HTTP against scripts/fake-upstash.mjs and
// asserts status codes, headers, HLEN and the exact command counts of spec 4.2 (read from the fake's GET /stats).
//   node scripts/vote-live-check.mjs --app http://127.0.0.1:<app> --store http://127.0.0.1:<store> [--token dev-token]
//        [--ns hv:local] --phase functional|unit|global [--fast]      (or --self-test: prints the family ids, needs nothing)
// Run each phase against a FRESH app process (off Vercel every client is the one key `local`, and the instance memo keeps a key's
// attempts for the whole UTC day, so a phase that pushed `local` past 16 attempts would poison the next one). Recipe, own ports:
//   node scripts/fake-upstash.mjs --port 3402 &
//   for each phase: KV_REST_API_URL=http://127.0.0.1:3402 KV_REST_API_TOKEN=dev-token VOTE_SALT=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))") \
//     pnpm exec next start --hostname 127.0.0.1 --port <own port> &   # from a production build
//   node scripts/vote-live-check.mjs --app ... --store ... --phase <phase>;  kill only the PID you started
// --fast skips the waits (the 120 s results cache and the 31 s reopen). Every value printed is a status or a count, never a token.
import { randomBytes } from 'node:crypto';

const FAMILY_IDS = {"touch":["one-finger","twin-stick","draw","conduct","brush"],"desktop":["cursor","one-finger-keys","flow","captured","mouse-keys","draw","conduct","brush"]};
if (process.argv.includes('--self-test')) { console.log(JSON.stringify({ familyIds: FAMILY_IDS })); process.exit(0); }

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const app = opt('app'), store = opt('store'), token = opt('token', 'dev-token'), ns = opt('ns', 'hv:local'), phase = opt('phase');
const fast = args.includes('--fast');
if (!app || !store || !['functional', 'unit', 'global'].includes(phase)) {
  console.error('usage: node scripts/vote-live-check.mjs --app URL --store URL [--token T] [--ns hv:local] --phase functional|unit|global [--fast]');
  process.exit(2);
}
const VOTES = `${ns}:vote:r3:s3`, CTL = `${ns}:ctl`, VOID = `${ns}:void:r3:s3`;
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` (${detail})`}`); };
const skip = (name, why) => console.log(`SKIP ${name} (${why})`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timed = (init = {}) => ({ ...init, redirect: 'manual', signal: AbortSignal.timeout(15000) });

const cmd = async (...c) => {
  const res = await fetch(`${store}/`, timed({ method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(c) }));
  const j = await res.json();
  if (!res.ok) throw new Error(`store command ${c[0]} failed: ${j.error}`);
  return j.result;
};
const commands = async () => (await (await fetch(`${store}/stats`, timed())).json()).commands;
const body = (over = {}) => ({ v: 3, device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow', 'brush'], last: 'brush', nonce: randomBytes(16).toString('hex'), ...over });

/** One request to the app, with the number of store commands it cost (a request is measured alone, nothing else runs). */
async function call(path, init) {
  const before = await commands();
  const res = await fetch(app + path, timed(init));
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, cost: (await commands()) - before, json: () => JSON.parse(text) };
}
const post = (b, { type = 'application/json', headers = {} } = {}) =>
  call('/api/vote', { method: 'POST', headers: { 'Content-Type': type, ...headers }, body: typeof b === 'string' ? b : JSON.stringify(b) });
const results = async () => (await call('/api/results')).json();
async function until(fn, maxMs, everyMs = 5000) {
  for (const end = Date.now() + maxMs; Date.now() < end; await sleep(everyMs)) { const v = await fn(); if (v) return v; }
  return null;
}
const utcHour = () => new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');

async function counted(label, n, first) {
  for (let i = first; i < first + n; i++) {
    const r = await post(body());
    check(`${label} attempt ${i}: 200 at 12 commands`, r.status === 200 && r.cost === 12, `status ${r.status}, ${r.cost} commands`);
  }
}

async function functional() {
  await cmd('HSET', CTL, 'unit', 200, 'block', 200, 'global', 20000, 'round', 1000, 'minv', 30);
  const first = await call('/api/results');
  const r0 = first.json();
  check('results: open, not ranked, no held hours, first read is 3 commands', r0.open === true && r0.families.touch.controls === null && r0.families.desktop.controls === null && !('heldHours' in r0) && first.cost === 3, `cost ${first.cost}`);
  const again = await call('/api/results');
  check('results: a repeat within 120 s costs 0 commands and is the same snapshot', again.cost === 0 && again.json().asOf === r0.asOf, `cost ${again.cost}`);

  const nonce = randomBytes(16).toString('hex');
  const v1 = await post(body({ nonce }));
  check('vote: 200 {ok:true} at 12 commands (gate A 5, gate B 6, write 1)', v1.status === 200 && v1.json().ok === true && v1.cost === 12, `status ${v1.status}, ${v1.cost} commands`);
  check('vote: HLEN 1', (await cmd('HLEN', VOTES)) === 1);
  const v2 = await post(body({ nonce }));
  check('same nonce again: 200 at 5 commands (gate A only, no budget spent), HLEN still 1', v2.status === 200 && v2.cost === 5 && (await cmd('HLEN', VOTES)) === 1, `status ${v2.status}, ${v2.cost} commands`);

  const zero = async (name, status, r) => check(`${name}: ${status} at 0 commands`, r.status === status && r.cost === 0, `status ${r.status}, ${r.cost} commands`);
  await zero('v2 body', 400, await post({ v: 2, device: 'desktop', favorite: 'flow', ratings: {}, note: '', build: 'x', nonce: body().nonce }));
  await zero('body with note', 400, await post(body({ note: 'hi' })));
  await zero('513-byte body', 413, await post(JSON.stringify(body({ favorite: 'x'.repeat(513 - JSON.stringify(body({ favorite: '' })).length) }))));
  await zero('text/plain body', 415, await post(body(), { type: 'text/plain' }));
  await zero('cross-site Sec-Fetch-Site', 403, await post(body(), { headers: { 'Sec-Fetch-Site': 'cross-site' } }));
  await zero('foreign Origin', 403, await post(body(), { headers: { Origin: 'https://evil.example' } }));
  check('HLEN unchanged by the refusals', (await cmd('HLEN', VOTES)) === 1);

  await cmd('HSET', CTL, 'mode', 'closed');
  const c1 = await post(body());
  check('closed: 503 closed, Retry-After 60, 5 commands', c1.status === 503 && c1.json().error === 'closed' && c1.headers.get('retry-after') === '60' && c1.cost === 5, `status ${c1.status}, ${c1.cost} commands`);
  await zero('closed again (instance latched 30 s)', 503, await post(body()));
  if (fast) { await cmd('HDEL', CTL, 'mode'); skip('reopen after 31 s', '--fast; mode cleared in the console'); } else {
    await sleep(31000);
    await cmd('HDEL', CTL, 'mode');
    const o = await post(body());
    check('reopened 31 s later: 200 at 12 commands', o.status === 200 && o.cost === 12, `status ${o.status}, ${o.cost} commands`);
  }

  // 36 touch entries from 12 groups (3 each): ranked. Voiding one group leaves 33 votes (30 shown) and 11 groups: not ranked.
  const hour = utcHour(), day = hour.slice(0, 8);
  for (let j = 0; j < 36; j++) await cmd('HSETNX', VOTES, (1000 + j).toString(16).padStart(32, '0'), `${hour}t${j % 3}072e0${(j % 12).toString(16)}`);
  if (fast) skip('ranked after seeding, and the void', '--fast; needs the 120 s results cache, run without --fast'); else {
    const ranked = await until(async () => { const r = await results(); return r.families.touch.ranked ? r : null; }, 130000);
    check('36 entries from 12 groups rank touch (votes 35)', !!ranked && ranked.families.touch.votes === 35 && ranked.families.touch.order?.length === 5, JSON.stringify(ranked?.families.touch));
    await cmd('SADD', VOID, `T:${day}:e00`);
    const gone = await until(async () => { const r = await results(); return r.families.touch.ranked ? null : r; }, 130000);
    check('voiding one group unranks touch (votes 30, controls null)', !!gone && gone.families.touch.votes === 30 && gone.families.touch.controls === null, JSON.stringify(gone?.families.touch));
  }
  await headers();
}

const COMMON = { 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), browsing-topics=()' };
const PAGE_CSP = "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'";
const API = { 'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox", 'cross-origin-resource-policy': 'same-origin', 'x-robots-tag': 'noindex' };
const CACHED = 'public, max-age=0, s-maxage=120';
async function headers() {
  const table = [['/', { ...COMMON, 'content-security-policy': PAGE_CSP }, 200], ['/results', { ...COMMON, 'content-security-policy': PAGE_CSP, 'x-robots-tag': 'noindex', 'cache-control': CACHED }, 200],
    ['/api/results', { ...COMMON, ...API, 'cache-control': CACHED }, 200], ['/api/vote', { ...COMMON, ...API, 'cache-control': 'no-store', allow: 'POST' }, 405]];
  for (const [path, want, status] of table) {
    const r = await call(path);
    const bad = Object.entries(want).filter(([k, v]) => r.headers.get(k) !== v).map(([k]) => `${k}=${r.headers.get(k)}`);
    const stray = [...r.headers.keys()].filter((k) => k.startsWith('access-control-') || k === 'set-cookie');
    check(`headers ${path}: ${status} and the section 6 set, no CORS, no cookie`, r.status === status && !bad.length && !stray.length, `status ${r.status}; ${bad.concat(stray).join('; ')}`);
  }
}

const untilMidnight = (h) => /^\d{1,5}$/.test(h ?? '') && +h >= 1 && +h <= 86400;
async function unit() {
  await counted('unit', 8, 1);
  check('unit: HLEN 8 after attempts 1 to 8', (await cmd('HLEN', VOTES)) === 8);
  for (let i = 9; i <= 16; i++) {
    const r = await post(body());
    check(`unit attempt ${i}: 429 later, Retry-After the seconds to UTC midnight, 5 commands`, r.status === 429 && r.json().error === 'later' && untilMidnight(r.headers.get('retry-after')) && r.cost === 5, `status ${r.status}, ${r.cost} commands`);
  }
  const r17 = await post(body());
  check('unit attempt 17: 429 at 0 commands (abusive key, from memory)', r17.status === 429 && r17.cost === 0, `status ${r17.status}, ${r17.cost} commands`);
  check('unit: HLEN still 8', (await cmd('HLEN', VOTES)) === 8);
}

async function global() {
  await cmd('HSET', CTL, 'unit', 200, 'block', 200, 'global', 3, 'round', 1000);
  await counted('global', 3, 1);
  check('global: HLEN 3', (await cmd('HLEN', VOTES)) === 3);
  const r4 = await post(body());
  check('global attempt 4: 429 later at 11 commands, latches the instance', r4.status === 429 && r4.json().error === 'later' && untilMidnight(r4.headers.get('retry-after')) && r4.cost === 11, `status ${r4.status}, ${r4.cost} commands`);
  const r5 = await post(body());
  check('global attempt 5: 429 at 0 commands', r5.status === 429 && r5.cost === 0, `status ${r5.status}, ${r5.cost} commands`);
  check('global: HLEN still 3', (await cmd('HLEN', VOTES)) === 3);
}

try {
  await cmd('FLUSHALL');
  console.log(`vote live check: phase ${phase}${fast ? ' (fast)' : ''}`);
  await { functional, unit, global }[phase]();
} catch (e) { failed++; console.log(`FAIL phase aborted (${e.message})`); }
console.log(failed ? `FAILED: ${failed} check(s)` : 'all checks passed');
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
// DEV TOOL ONLY (spec 12.1). A fake Upstash Redis REST server for trying the vote end to end over real HTTP: in memory, no
// persistence, loopback only, no dependency. Never shipped (.vercelignore excludes scripts/) and it refuses to start on Vercel.
//   node scripts/fake-upstash.mjs [--port 3402] [--token dev-token] [--ns hv:local] [--demo]
// --demo seeds 40 sample touch votes from 14 network groups (so /results ranks at once, with the ranking floor minv set to 30) and
// raises the ctl limits (unit, block, global, round), because off Vercel every client is the one address `local` and the 9th vote
// from it is refused with 429 under the default limits.
// POST /multi-exec is atomic (one synchronous loop) and answers [{result}|{error}] like Upstash; GET /stats (no token) answers
// {"commands": n}, the commands run through /multi-exec, so a check can assert the exact counts of spec 4.2. POST / takes one
// command (console use, not counted). The token is never printed.
import http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WRONGTYPE = 'WRONGTYPE Operation against a key holding the wrong kind of value';
const NOT_INT = 'ERR value is not an integer or out of range';
const INT = /^-?\d+$/;
// [min, max] argument count without the command name; a wrong count is Redis's arity error.
const ARITY = {
  SET: [2, 6], GET: [1, 1], INCR: [1, 1], HMGET: [2, 99], HLEN: [1, 1], HSETNX: [3, 3], HSET: [3, 99], HDEL: [2, 99], HGETALL: [1, 1],
  SADD: [2, 99], SREM: [2, 99], SMEMBERS: [1, 1], DEL: [1, 99], TTL: [1, 1], EXPIRE: [2, 2], FLUSHALL: [0, 0],
};
class RedisError extends Error {}
const fail = (m) => { throw new RedisError(m); };

/** The in-memory engine. Expiry is lazy on read from `clock`. multi() runs a whole batch in one synchronous loop. */
export function createStore(clock = Date.now) {
  const data = new Map();
  const expires = new Map();
  const live = (k) => {
    const at = expires.get(k);
    if (at !== undefined && clock() >= at) { data.delete(k); expires.delete(k); }
    return data.get(k);
  };
  const get = (k, kind) => { const e = live(k); if (e && e.kind !== kind) fail(WRONGTYPE); return e; };
  const put = (k, e, keepTtl = true) => { data.set(k, e); if (!keepTtl) expires.delete(k); };
  const drop = (k) => { data.delete(k); expires.delete(k); };
  const remove = (k, c, xs) => {
    const n = c ? xs.filter((x) => c.delete(x)).length : 0;
    if (c && !c.size) drop(k);
    return n;
  };
  const set = (k, r) => {
    let nx = false, ex = null;
    for (let i = 1; i < r.length; i++) {
      const o = r[i].toUpperCase();
      if (o === 'NX') nx = true;
      else if (o === 'EX' && i + 1 < r.length) {
        if (!INT.test(r[i + 1]) || Number(r[i + 1]) <= 0) fail("ERR invalid expire time in 'set' command");
        ex = Number(r[++i]);
      } else fail('ERR syntax error');
    }
    if (nx && live(k)) return null;
    put(k, { kind: 'str', v: r[0] }, false);
    if (ex !== null) expires.set(k, clock() + ex * 1000);
    return 'OK';
  };
  const run = (cmd) => {
    const name = String(cmd[0] ?? '').toUpperCase();
    const a = cmd.slice(1).map(String);
    const ar = ARITY[name];
    if (!ar) fail(`ERR unknown command '${name.toLowerCase()}'`);
    if (a.length < ar[0] || a.length > ar[1]) fail(`ERR wrong number of arguments for '${name.toLowerCase()}' command`);
    const [k, ...r] = a;
    switch (name) {
      case 'SET': return set(k, r);
      case 'GET': return get(k, 'str')?.v ?? null;
      case 'INCR': {
        const e = get(k, 'str');
        if (e && !INT.test(e.v)) fail(NOT_INT);
        const n = (e ? Number(e.v) : 0) + 1;
        put(k, { kind: 'str', v: String(n) });
        return n;
      }
      case 'HMGET': { const h = get(k, 'hash')?.v; return r.map((f) => (h?.has(f) ? h.get(f) : null)); }
      case 'HLEN': return get(k, 'hash')?.v.size ?? 0;
      case 'HSETNX': {
        const h = get(k, 'hash')?.v ?? new Map();
        if (h.has(r[0])) return 0;
        h.set(r[0], r[1]);
        put(k, { kind: 'hash', v: h });
        return 1;
      }
      case 'HSET': {
        if (r.length % 2) fail("ERR wrong number of arguments for 'hset' command");
        const h = get(k, 'hash')?.v ?? new Map();
        let added = 0;
        for (let i = 0; i < r.length; i += 2) { if (!h.has(r[i])) added++; h.set(r[i], r[i + 1]); }
        put(k, { kind: 'hash', v: h });
        return added;
      }
      case 'HDEL': return remove(k, get(k, 'hash')?.v, r);
      case 'HGETALL': return [...(get(k, 'hash')?.v ?? [])].flat();
      case 'SADD': {
        const s = get(k, 'set')?.v ?? new Set();
        const n = r.filter((m) => !s.has(m) && s.add(m)).length;
        put(k, { kind: 'set', v: s });
        return n;
      }
      case 'SREM': return remove(k, get(k, 'set')?.v, r);
      case 'SMEMBERS': return [...(get(k, 'set')?.v ?? [])];
      case 'DEL': return a.filter((x) => { const had = !!live(x); drop(x); return had; }).length;
      case 'TTL': {
        if (!live(k)) return -2;
        const at = expires.get(k);
        return at === undefined ? -1 : Math.ceil((at - clock()) / 1000);
      }
      case 'EXPIRE': {
        if (!INT.test(r[0])) fail(NOT_INT);
        if (!live(k)) return 0;
        expires.set(k, clock() + Number(r[0]) * 1000);
        return 1;
      }
      default: data.clear(); expires.clear(); return 'OK'; // FLUSHALL
    }
  };
  const one = (c) => {
    if (!Array.isArray(c) || !c.length || c.some((x) => typeof x !== 'string' && typeof x !== 'number')) return { error: 'ERR invalid command' };
    try { return { result: run(c) }; } catch (e) { if (e instanceof RedisError) return { error: e.message }; throw e; }
  };
  return { commands: 0, run, multi: (cmds) => cmds.map(one) };
}

/** The HTTP surface as a pure function, so tests can drive it without a port: -> { status, body }. */
export function handle(store, token, method, path, headers, text) {
  const reply = (status, body) => ({ status, body });
  if (method === 'GET' && path === '/stats') return reply(200, { commands: store.commands });
  if (method !== 'POST' || (path !== '/multi-exec' && path !== '/')) return reply(404, { error: 'ERR not found' });
  if (headers.authorization !== `Bearer ${token}`) return reply(401, { error: 'Unauthorized' });
  let cmds;
  try { cmds = JSON.parse(text); } catch { return reply(400, { error: 'ERR failed to parse command' }); }
  if (!Array.isArray(cmds)) return reply(400, { error: 'ERR failed to parse command' });
  if (path === '/') { const [r] = store.multi([cmds]); return reply('error' in r ? 400 : 200, r); }
  store.commands += cmds.length;
  return reply(200, store.multi(cmds));
}

export const DEMO_TOUCH_CONTROLS = 5;
const hex = (n, w = 1) => n.toString(16).padStart(w, '0');
/** 40 touch votes from 14 groups (12 groups of 3, 2 of 2), by index arithmetic only, and the raised ctl limits. */
export function seedDemo(store, ns, now = Date.now()) {
  const hour = new Date(now).toISOString().slice(0, 13).replace(/[-T]/g, '');
  const cmds = [['HSET', `${ns}:ctl`, 'unit', 200, 'block', 200, 'global', 20000, 'round', 1000, 'minv', 30]];
  for (let j = 0; j < 40; j++) {
    const size = 2 + (j % 3), first = j % DEMO_TOUCH_CONTROLS;
    const bits = Array.from({ length: size }, (_, i) => (first + i) % DEMO_TOUCH_CONTROLS);
    const mask = bits.reduce((m, b) => m | (1 << b), 0);
    const entry = `${hour}t${hex(bits[j % size])}${hex(mask, 2)}${hex(bits[(j + 1) % size])}00${hex(j % 14)}`;
    cmds.push(['HSETNX', `${ns}:vote:r3:s3`, hex(j, 32), entry]);
  }
  for (const r of store.multi(cmds)) if ('error' in r) throw new Error(r.error);
}

function parseArgs(argv) {
  const o = { port: 3402, token: 'dev-token', ns: 'hv:local', demo: false };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--demo') o.demo = true;
    else if (f === '--port' || f === '--token' || f === '--ns') o[f.slice(2)] = argv[++i];
    else return null;
  }
  o.port = /^\d+$/.test(String(o.port)) ? Number(o.port) : NaN;
  return o.port >= 1 && o.port <= 65535 && o.token && /^[\w:-]+$/.test(o.ns ?? '') ? o : null;
}

function main() {
  if (process.env.VERCEL) { console.error('fake-upstash is a dev tool and refuses to run on Vercel'); process.exit(1); }
  const o = parseArgs(process.argv.slice(2));
  if (!o) { console.error('usage: node scripts/fake-upstash.mjs [--port 3402] [--token dev-token] [--ns hv:local] [--demo]'); process.exit(2); }
  const store = createStore();
  const server = http.createServer((req, res) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 1 << 20) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      const path = (req.url ?? '/').split('?')[0];
      const { status, body } = handle(store, o.token, req.method, path, req.headers, Buffer.concat(chunks).toString('utf8'));
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    });
  });
  server.listen(o.port, '127.0.0.1', () => {
    console.log(`fake-upstash listening on http://127.0.0.1:${o.port}`);
    if (o.demo) { seedDemo(store, o.ns); console.log('demo data seeded: 40 votes, 14 groups; ctl unit, block, global, round raised, minv 30'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

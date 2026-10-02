#!/usr/bin/env node
// OWNER TOOL, read-only (spec 7.3). Run it in your own shell with your own Upstash credentials: it reads the vote hash, the void set and
// the ctl knobs, names the network groups behind a bad hour or day, and prints ready-to-paste SADD void lines. It sends only HGETALL,
// SMEMBERS, HLEN and GET, never writes, never prints the URL or the token, and is never deployed (.vercelignore excludes scripts/).
// Upstash only. For Neon run the audit SELECTs in docs/vote-runbook.md in the Neon SQL editor instead.
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/vote-audit.mjs [--hours 48] [--env production] --yes
//   node scripts/vote-audit.mjs --self-test     (no environment: prints the family ids and a few decoded sample entries, exits 0)
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FAMILY_IDS = {"touch":["one-finger","twin-stick","draw","conduct","brush"],"desktop":["cursor","one-finger-keys","flow","captured","mouse-keys","draw","conduct","brush"]};
const DEFAULTS = {"touch":"one-finger","desktop":"cursor"}; // src/game/controlTypes.ts DEFAULT_CONTROL: the control every visitor starts on
const ROUND = 'r3:s3';
const SAMPLES = ['2026093014d2857a3f', '2026093014t415201c', '2026093014dx052b20', '2026133014d2857a3f', '2026093014d2807a3f', '2026093014d285'];

/** One stored entry (hour 10, device 1, favorite 1, mask 2, last 1, tag 3) as src/lib/vote/entry.ts decodes it, or null. */
export function decode(s) {
  if (typeof s !== 'string' || !/^\d{10}[td][0-9a-fx][0-9a-f]{2}[0-9a-f][0-9a-f]{3}$/.test(s)) return null;
  const hour = s.slice(0, 10), [y, mo, d, h] = [+hour.slice(0, 4), +hour.slice(4, 6), +hour.slice(6, 8), +hour.slice(8)];
  const t = new Date(Date.UTC(y, mo - 1, d, h));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || t.getUTCHours() !== h) return null;
  const device = s[10] === 't' ? 'touch' : 'desktop', ids = FAMILY_IDS[device], mask = parseInt(s.slice(12, 14), 16);
  if (mask >> ids.length) return null;
  const tried = ids.filter((_, i) => mask & (1 << i)), last = ids[parseInt(s[14], 16)];
  const favorite = s[11] === 'x' ? null : ids[parseInt(s[11], 16)];
  if (tried.length < 2 || !tried.includes(last) || (s[11] !== 'x' && !tried.includes(favorite))) return null;
  return { hour, device, favorite, tried, last, tag: s.slice(15) };
}

const inc = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
/** Last-flown maths over the picks of `list` (a tie is no pick). A ballot that tried k controls gives its last-flown control a 1/k chance, so the baseline follows the ballot mix: with the default plus one suggested control (k = 2) it is 50%.
 *  sub: ballots that tried the default and flew another control last, the shape /results reports (the starting control stands in for "flown first"). */
function order(list) {
  const o = { n: 0, last: 0, chance: 0, variance: 0, sub: 0, subLast: 0, subFirst: 0, subChance: 0 };
  for (const e of list) {
    if (!e.favorite) continue;
    const p = 1 / e.tried.length, first = DEFAULTS[e.device], win = e.favorite === e.last;
    o.n++; o.chance += p; o.variance += p * (1 - p); if (win) o.last++;
    if (e.last !== first && e.tried.includes(first)) { o.sub++; o.subChance += p; if (win) o.subLast++; else if (e.favorite === first) o.subFirst++; }
  }
  return { ...o, z: (o.last - o.chance) / Math.sqrt(o.variance || 1) };
}

/** The report. input: { pairs: [nonce, entry][], voids: string[], ctl: {field: value}, rlg: {YYYYMMDD: number|null}, hlen, ns, now, hours }. */
export function analyze({ pairs, voids, ctl, rlg, hlen, ns, now, hours }) {
  const vh = new Set(), vg = new Set(), lines = [], flags = [], voidLines = new Set();
  for (const m of voids) {
    const g = /^T:(\d{8}|\d{10}):([0-9a-f]{3})$/.exec(m);
    if (/^\d{10}$/.test(m)) vh.add(m); else if (g) vg.add(`${g[1]}:${g[2]}`);
  }
  const since = new Date(now - hours * 3600e3).toISOString().replace(/\D/g, '').slice(0, 10);
  const cap = /^\d{1,3}$/.test(ctl.cap ?? '') && +ctl.cap >= 2 && +ctl.cap <= 100 ? +ctl.cap : 5;
  // es: the entries inside the window (the hourly lines and the count). whole: every entry of every UTC day the window touches, so a
  // group is judged on its whole day like the reader does (CODE-5: windowing first undercounted the day the window starts inside).
  const es = [], whole = [];
  let bad = 0, voided = 0;
  for (const [, v] of pairs) {
    const e = decode(v);
    if (!e) bad++;
    else if (e.hour.slice(0, 8) >= since.slice(0, 8)) {
      const gone = vh.has(e.hour) || vg.has(`${e.hour.slice(0, 8)}:${e.tag}`) || vg.has(`${e.hour}:${e.tag}`), inside = e.hour >= since;
      if (gone) { if (inside) voided++; } else { whole.push({ ...e, day: e.hour.slice(0, 8) }); if (inside) es.push(whole.at(-1)); }
    }
  }
  const flag = (m) => { flags.push(m); lines.push(`FLAG ${m}`); };
  const knobs = ['mode', 'unit', 'block', 'global', 'max', 'cap', 'minv', 'round'].filter((k) => ctl[k] !== undefined).map((k) => `${k}=${ctl[k]}`).join(' ');
  lines.push(`${ns} round ${ROUND}: HLEN ${hlen}, ${es.length} entries in the last ${hours} h, ${voided} voided, ${bad} unreadable, ${voids.length} void members, cap ${cap}, ctl: ${knobs || 'defaults'}`);
  const byHour = new Map(), byDay = new Map();
  for (const e of es) (byHour.get(e.hour) ?? byHour.set(e.hour, []).get(e.hour)).push(e);
  for (const e of whole) (byDay.get(e.day) ?? byDay.set(e.day, []).get(e.day)).push(e);
  const hours2 = [...byHour.keys()].sort();
  for (const h of hours2) {
    const list = byHour.get(h), tags = new Map(), picks = new Map(), o = order(list);
    for (const e of list) { inc(tags, e.tag); inc(picks, `${e.device[0]}:${e.favorite ?? 'tie'}`); }
    const [[best, n]] = top(picks, 1);
    lines.push(`hour ${h}: ${list.length} entries; groups ${top(tags, 3).map(([g, c]) => `${g}:${c}`).join(' ')}; top ${best} ${pct(n, list.length)}%; last-flown ${pct(o.last, o.n)}% of ${o.n} picks (chance ${pct(o.chance, o.n)}%); picks ${top(picks, 99).map(([k, c]) => `${k} ${c}`).join(', ')}`);
  }
  const counts = hours2.map((h) => byHour.get(h).length), sorted = [...counts].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  for (const h of hours2) if (byHour.get(h).length > 3 * median) flag(`hour ${h} has ${byHour.get(h).length} entries, more than 3 times the median ${median}`);
  const at = (h) => Date.UTC(+h.slice(0, 4), +h.slice(4, 6) - 1, +h.slice(6, 8), +h.slice(8));
  for (let i = 0, j; i < hours2.length; i = j + 1) {
    for (j = i; j + 1 < hours2.length && at(hours2[j + 1]) - at(hours2[j]) === 3600e3;) j++;
    const run = counts.slice(i, j + 1), mean = run.reduce((a, b) => a + b, 0) / run.length;
    if (run.length >= 6 && Math.sqrt(run.reduce((a, b) => a + (b - mean) ** 2, 0) / run.length) / mean < 0.25) flag(`a flat count of about ${Math.round(mean)} an hour across ${run.length} consecutive hours from ${hours2[i]}`);
  }
  for (const day of [...byDay.keys()].sort()) {
    const list = byDay.get(day), groups = new Map(), sizes = new Map();
    for (const e of list) inc(groups, `${e.tag}/${e.device}`);
    const counted = [...groups.values()].reduce((a, n) => a + Math.min(n, cap), 0);
    for (const n of groups.values()) inc(sizes, Math.min(n, 5));
    lines.push(`day ${day}: rlg ${rlg[day] ?? 'none'}, ${list.length} entries, ${counted} counted after the cap, ${list.length - counted} capped; groups of 1,2,3,4,5+: ${[1, 2, 3, 4, 5].map((n) => sizes.get(n) ?? 0).join(',')}; largest ${top(groups, 5).map(([g, n]) => `${g} ${n}`).join(', ')}`);
    for (const [key, n] of top(groups, 999)) {
      const [g, device] = key.split('/');
      if (n > cap) { flag(`group ${g} (${device}) has ${n} entries on ${day}, over the cap of ${cap}`); voidLines.add(`SADD ${ns}:void:${ROUND} T:${day}:${g}`); }
      else if (n / list.length >= 0.3) flag(`group ${g} (${device}) is ${pct(n, list.length)}% of ${day}`);
    }
    const same = [...sizes].filter(([n, c]) => n >= 3 && c >= 10);
    if (same.length) flag(`${day}: ${same.map(([n, c]) => `${c} groups with ${n === 5 ? '5 or more' : n} entries`).join(', ')}`);
    for (const device of Object.keys(FAMILY_IDS)) {
      const own = list.filter((e) => e.device === device), picks = new Map();
      for (const e of own) if (e.favorite) inc(picks, e.favorite);
      const [[id, n] = ['', 0]] = top(picks, 1);
      if (own.length >= 30 && n / own.length >= 0.7) flag(`${day}: ${id} is ${pct(n, own.length)}% of ${own.length} ${device} entries`);
      const o = order(own); // last-flown wins well past chance for this ballot mix: 30+ picks, 3 standard errors and 10 points over
      if (o.n >= 30 && o.z >= 3 && o.last - o.chance >= o.n / 10) flag(`${day}: the last-flown control won ${pct(o.last, o.n)}% of ${o.n} ${device} picks, chance for these ballots is ${pct(o.chance, o.n)}% (${o.z.toFixed(1)} standard errors over)`);
    }
  }
  for (const device of Object.keys(FAMILY_IDS)) {
    const o = order(es.filter((e) => e.device === device));
    if (o.n) lines.push(`order ${device}: last-flown won ${pct(o.last, o.n)}% of ${o.n} picks (chance ${pct(o.chance, o.n)}%); default flown and another control last: last won ${pct(o.subLast, o.sub)}%, default ${pct(o.subFirst, o.sub)}% of ${o.sub} picks (chance ${pct(o.subChance, o.sub)}% each)`);
  }
  if (voidLines.size) lines.push('Paste to void (reversible with SREM; a group void keeps honest votes from other groups):', ...voidLines);
  if (!flags.length) lines.push('No flags.');
  return { lines, flags, voidLines: [...voidLines] };
}

/** One /multi-exec round trip of read commands. Throws only fixed text: nothing from the URL, the token or the reply. */
export async function collect(url, token, ns, days, fetchImpl = fetch) {
  const cmds = [['HGETALL', `${ns}:vote:${ROUND}`], ['SMEMBERS', `${ns}:void:${ROUND}`], ['HGETALL', `${ns}:ctl`], ['HLEN', `${ns}:vote:${ROUND}`], ...days.map((d) => ['GET', `${ns}:rlg:${d}`])];
  let out = null;
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/multi-exec`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
    out = res.ok ? await res.json() : null;
  } catch { out = null; }
  if (!Array.isArray(out) || out.length !== cmds.length || out.some((o) => !o || typeof o !== 'object' || 'error' in o)) throw new Error('the store did not answer as expected');
  const pairs = (flat) => Array.from({ length: Math.floor((flat ?? []).length / 2) }, (_, i) => [flat[2 * i], flat[2 * i + 1]]);
  return { pairs: pairs(out[0].result), voids: out[1].result ?? [], ctl: Object.fromEntries(pairs(out[2].result)), hlen: out[3].result, rlg: Object.fromEntries(days.map((d, i) => [d, out[4 + i].result === null ? null : Number(out[4 + i].result)])) };
}

/** The CLI. Returns the exit code. fetchImpl is for tests (the fake store), never a network address. */
export async function main(argv, env, fetchImpl = fetch) {
  if (argv.includes('--self-test')) { console.log(JSON.stringify({ familyIds: FAMILY_IDS, defaults: DEFAULTS, decoded: Object.fromEntries(SAMPLES.map((s) => [s, decode(s)])) })); return 0; }
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const name = arg('env', env.VOTE_ENV || 'production'), hours = Number(arg('hours', '48'));
  if (!/^[a-z]{1,20}$/.test(name) || !Number.isInteger(hours) || hours < 1 || hours > 720) { console.error('usage: node scripts/vote-audit.mjs [--hours 1..720] [--env production|preview|local] --yes'); return 2; }
  if (name === 'production' && !argv.includes('--yes')) { console.error('This reads the production namespace. Add --yes to confirm.'); return 2; }
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) { console.error(env.DATABASE_URL || env.POSTGRES_URL ? 'This script reads Upstash only. For Neon run the audit SELECTs in docs/vote-runbook.md.' : 'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL and KV_REST_API_TOKEN) in your own shell.'); return 2; }
  let u = null;
  try { u = new URL(url); } catch { /* checked below */ }
  if (!u || !(u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)))) { console.error('The store URL must be https (http only for a local fake).'); return 2; }
  const now = Date.now(), days = new Set();
  for (let h = 0; h <= hours; h++) days.add(new Date(now - h * 3600e3).toISOString().slice(0, 10).replace(/-/g, ''));
  try { console.log(analyze({ ...(await collect(url, token, `hv:${name}`, [...days].sort(), fetchImpl)), ns: `hv:${name}`, now, hours }).lines.join('\n')); } catch (e) { console.error(`audit failed: ${e instanceof Error && e.message.startsWith('the store') ? e.message : 'internal error'}`); return 1; }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2), process.env);

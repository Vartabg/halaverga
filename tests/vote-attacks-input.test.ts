import { afterEach, describe, expect, it, vi } from 'vitest';
import * as route from '@/app/api/vote/route';
import { decodeEntry, encodeEntry } from '@/lib/vote/entry';
import { depsFromEnv } from '@/server/vote/config';
import { handleVote } from '@/server/vote/handlers';
import { readResults } from '@/server/vote/results';
import type { VoteStore } from '@/server/vote/store';
import { FakeRedis } from './fixtures/fake-redis';
import { CTL, D, NS, SALT, T0, VOTES, blockIp, fire, json, setup, vote, voteBody, voteReq } from './helpers/voteBody';
import { nonce, tag } from './helpers/voteAgg';

// Attack regressions for the server: hostile input, deadlines, cost of garbage, secrets and the tally's independence (spec 11.2).
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const URL_ = 'https://halaverga.test/api/vote', H = { host: 'halaverga.test', 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.9' };
const raw = (body: BodyInit) => new Request(URL_, { method: 'POST', body, headers: H });
const KV = { KV_REST_API_URL: 'https://kv.io', KV_REST_API_TOKEN: 'tok-secret' };

describe('note family and P2, P8: no free text, no extra key', () => {
  const notes = ['‮evil', '\u{E0041}\u{E0042}', '=HYPERLINK("http://evil","x")', 'http://evil.example/x', 'Z̵̢a̵l̶g̸o', '<script>alert(1)</script>', '+cmd|calc', '@SUM(1)', 'a​b', '\ud800', 'x'.repeat(200), 'nonce 3f9a0c1e5b7d42a88c6e1f0d9b3a7c25'];

  it('P2 N1 N3 N4 N5 N7 N8 N9 PRIV-2 R6 note family: a body carrying note, why, build or ratings is 400 and stores nothing', async () => {
    const s = setup();
    for (const text of notes) for (const key of ['note', 'why', 'build', 'ratings']) expect((await vote(s, '203.0.113.9', { [key]: text })).status).toBe(400);
    expect([s.redis.execCalls, s.redis.keys()]).toEqual([0, []]);
  });

  it('P2 note family: a nonce-like or hostile string where an id belongs is 400 too', async () => {
    const s = setup();
    for (const text of notes) for (const key of ['favorite', 'last', 'device']) expect((await vote(s, '203.0.113.9', { [key]: text })).status).toBe(400);
    expect((await vote(s, '203.0.113.9', { tried: ['flow', notes[0]] })).status).toBe(400);
    expect(s.redis.execCalls).toBe(0);
  });

  it('P2 invalid UTF-8 is 400, and 500 invalid bytes (under the cap) are 400 not 413; 600 are 413', async () => {
    const s = setup();
    for (const [bytes, status] of [[3, 400], [500, 400], [600, 413]] as const) {
      const r = await handleVote(raw(new Uint8Array(bytes).fill(0xff)), s.deps);
      expect(await json(r)).toEqual({ status, body: { ok: false, error: status === 400 ? 'bad-vote' : 'too-large' } });
    }
    expect(s.redis.execCalls).toBe(0);
  });

  it('P8 a build is not accepted and the results carry no stale, build, total or notes field', async () => {
    const s = setup();
    expect((await vote(s, '203.0.113.9', { build: '2026-09-30 · abc1234' })).status).toBe(400);
    const keys = JSON.stringify(await readResults(s.redis, NS, 'r3', T0)).match(/"[a-zA-Z]+":/g)!.join('');
    for (const gone of ['stale', 'build', 'total', 'notes', 'heldHours']) expect(keys).not.toContain(`"${gone}`);
  });

  it('R4 1,000 forced default-only votes cannot exist: one tried control is 400, and the tally does not move', async () => {
    const s = setup();
    const out = await fire(s, 1000, blockIp, () => ({ tried: ['flow'], favorite: 'flow', last: 'flow' }));
    expect(new Set(out.map((o) => o.status))).toEqual(new Set([400]));
    expect([s.redis.execCalls, (await readResults(s.redis, NS, 'r3', T0)).families.desktop.votes]).toEqual([0, 0]);
  });
});

describe('P6, cost:C6, cost:C7, cost:C10 deadlines and the cost of garbage', () => {
  it('P6 a stalled body answers 408 slow at 2 s, cancels the reader, and costs 0 commands', async () => {
    vi.useFakeTimers();
    const s = setup();
    let cancelled = false, done = false;
    const body = new ReadableStream({ pull: () => new Promise<void>(() => {}), cancel() { cancelled = true; } }, { highWaterMark: 0 });
    const p = handleVote(new Request(URL_, { method: 'POST', body, headers: H, duplex: 'half' } as RequestInit), s.deps).then((r) => { done = true; return r; });
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(201);
    expect(await json(await p)).toEqual({ status: 408, body: { ok: false, error: 'slow' } });
    expect([cancelled, s.redis.execCalls]).toEqual([true, 0]);
  });

  it('cost:C6 10,000 sends against a dead store make at most 3 store calls in 10 s (one per 5 s per instance)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup();
    s.redis.failWith = new Error('down');
    for (let i = 0; i < 10_000; i++) { s.tick(1); await vote(s, blockIp(i)); }
    expect(s.redis.execCalls).toBeGreaterThanOrEqual(2);
    expect(s.redis.execCalls).toBeLessThanOrEqual(3);
  });

  // A store whose every reply takes `takes` ms unless the call's own timeout comes first; it records each call's budget.
  const slowStore = (s: ReturnType<typeof setup>, takes: number, budgets: (number | undefined)[], callBudgetMs?: number): VoteStore => ({
    callBudgetMs,
    exec: (c, o) => new Promise((res, rej) => {
      budgets.push(o?.timeoutMs);
      const cut = o?.timeoutMs ?? Infinity;
      if (cut < takes) setTimeout(() => rej(new Error('timeout')), cut); else setTimeout(() => res(s.redis.exec(c)), takes);
    }),
  });

  it('cost:C7 slow store calls stop at the 6 s handler deadline: each call gets what is left of it, and the vote answers 502 by 6 s', async () => {
    vi.useFakeTimers({ now: T0 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup({ now: () => Date.now() });
    const budgets: (number | undefined)[] = [];
    s.deps.store = slowStore(s, 2900, budgets, 3000); // a Neon-sized call budget: three calls of 3 s would be 9 s
    let end = 0;
    const p = vote(s).then((r) => { end = Date.now(); return r; });
    await vi.advanceTimersByTimeAsync(7000);
    const r = await p;
    expect(budgets).toEqual([3000, 3000, 200]);
    expect([r.status, end - T0]).toEqual([502, 6000]);
  });

  it('cost:C7 a store with no call budget keeps 2 s per call: the three calls of a vote get 2 s each and never more', async () => {
    vi.useFakeTimers({ now: T0 });
    const s = setup({ now: () => Date.now() });
    const budgets: (number | undefined)[] = [];
    s.deps.store = slowStore(s, 1900, budgets);
    const p = vote(s);
    await vi.advanceTimersByTimeAsync(7000);
    expect(budgets).toEqual([2000, 2000, 2000]);
    expect((await p).status).toBe(200);
  });

  it('cost:C7 a vote whose 6 s are spent makes no further store call and answers 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup();
    const late: VoteStore = { exec: async (c, o) => { const r = await s.redis.exec(c, o); s.tick(6000); return r; } };
    s.deps.store = late;
    expect((await vote(s)).status).toBe(502);
    expect(s.redis.execCalls).toBe(1);
  });

  it('cost:C10 garbage, OPTIONS-less routes and cross-site cost 0 commands, and the route answers OPTIONS with only POST and 405 for everything else', async () => {
    const s = setup();
    const bad: Request[] = [];
    for (let i = 0; i < 100; i++) bad.push(raw('{"v":3'), raw(''), raw('[]'), raw(JSON.stringify({ ...voteBody(), v: 2 })), voteReq(voteBody(), { headers: { 'sec-fetch-site': 'cross-site' } }), voteReq(voteBody(), { headers: { 'content-type': 'text/plain' } }));
    for (const r of bad) expect((await handleVote(r, s.deps)).status).toBeGreaterThanOrEqual(400);
    expect([s.redis.execCalls, s.redis.commands]).toEqual([0, 0]);
    expect(Object.keys(route).sort()).toEqual(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
    for (const m of [route.GET, route.PUT, route.PATCH, route.DELETE, route.HEAD]) expect((m as () => Response)().status).toBe(405);
  });

  it('P5 OPTIONS /api/vote advertises only what is served (POST and OPTIONS), not the seven methods Next would list, and is never cached; every 405 says Allow: POST', () => {
    const o = (route.OPTIONS as () => Response)();
    expect([o.status, o.headers.get('allow'), o.headers.get('cache-control')]).toEqual([204, 'POST, OPTIONS', 'no-store']);
    for (const m of [route.GET, route.PUT, route.PATCH, route.DELETE, route.HEAD]) expect((m as () => Response)().headers.get('allow')).toBe('POST');
  });
});

describe('PRIV-1 and W5 secrets and environments', () => {
  const quiet = () => vi.spyOn(console, 'log').mockImplementation(() => {});

  it('PRIV-1 no salt, a short salt or a token-only environment means store null: 503 closed, 0 commands, no fetch', async () => {
    quiet();
    const f = vi.fn();
    for (const env of [KV, { ...KV, VOTE_SALT: 'short' }, { ...KV, VOTE_SALT: '' }, { ...KV, VOTE_SALT: 'tok-secret' }]) {
      const deps = depsFromEnv(env, f);
      expect(deps.store).toBeNull();
      expect(await json(await handleVote(voteReq(), deps))).toEqual({ status: 503, body: { ok: false, error: 'closed' } });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('PRIV-1 unit and block keys are 6 hex and the tag 3 hex, and every stored key and value is free of the address, the salt and any token', async () => {
    const s = setup();
    await fire(s, 3, () => '203.0.113.9');
    const dump: string[] = [];
    for (const k of s.redis.keys()) {
      dump.push(k);
      for (const c of ['GET', 'HGETALL', 'SMEMBERS']) try { dump.push(JSON.stringify(s.redis.admin([c, k]))); } catch { /* wrong type */ }
    }
    const text = dump.join('\n');
    for (const secret of ['203.0.113', '203', SALT, 'tok-secret']) expect(text).not.toContain(secret);
    const rl = s.redis.keys().filter((k) => k.includes(':rl:'));
    expect(rl).toHaveLength(3);
    for (const k of rl.filter((x) => !x.includes(':rl:r:'))) expect(k).toMatch(new RegExp(`^${NS}:rl:[ub]:${D}:[0-9a-f]{6}$`));
    const round = rl.filter((x) => x.includes(':rl:r:'));
    expect(round).toHaveLength(1);
    expect(round[0]).toMatch(new RegExp(`^${NS}:rl:r:[0-9a-f]{6}$`)); // no day: the one key that links a network across days, a bare counter
    for (const v of Object.values(s.redis.hash(VOTES))) expect(decodeEntry(v)!.tag).toMatch(/^[0-9a-f]{3}$/);
  });

  it('W5 a preview deployment without VOTE_ALLOW_PREVIEW and a non-https production URL answer 503 closed with no fetch', async () => {
    quiet();
    const f = vi.fn(), good = { ...KV, VOTE_SALT: SALT };
    for (const env of [{ ...good, VERCEL_ENV: 'preview' }, { ...good, VERCEL_ENV: 'production', KV_REST_API_URL: 'http://kv.io' }]) {
      expect((await handleVote(voteReq(), depsFromEnv(env, f))).status).toBe(503);
    }
    expect(f).not.toHaveBeenCalled();
    expect(depsFromEnv({ ...good, VERCEL_ENV: 'preview', VOTE_ALLOW_PREVIEW: '1' }).store).not.toBeNull();
  });
});

describe('atk:3 unit, block, global and max never change a published number; cap and minv do', () => {
  function seeded() {
    const redis = new FakeRedis(() => T0);
    redis.admin(['HSET', CTL, 'minv', 30]); // the default floor is 300
    for (let i = 0; i < 44; i++) redis.admin(['HSETNX', VOTES, nonce(), encodeEntry({ device: 'desktop', favorite: i % 3 ? 'flow' : 'cursor', tried: ['cursor', 'flow', 'draw'], last: 'draw' }, '2026093014', tag(i % 14))]);
    return redis;
  }
  const read = (r: FakeRedis) => readResults(r, NS, 'r3', T0);

  it('atk:3 the same entries read the same under any of the four limits, and differently under cap or minv', async () => {
    const redis = seeded(), base = await read(redis);
    expect(base.families.desktop).toMatchObject({ ranked: true, votes: 40 });
    for (const f of [['unit', 1], ['block', 2], ['global', 3], ['max', 100], ['unit', 200], ['block', 2000], ['global', 20000], ['max', 20000], ['round', 1], ['round', 1000]] as const) {
      redis.admin(['HSET', CTL, f[0], f[1]]);
      expect(await read(redis)).toEqual(base);
    }
    redis.admin(['HSET', CTL, 'cap', 2]);
    expect((await read(redis)).families.desktop.votes).toBe(20); // 14 groups of 3: scale 2/3, and one favorite weighs at most 1 (R1), 23.3 counted
    redis.admin(['HDEL', CTL, 'cap']);
    redis.admin(['HSET', CTL, 'minv', 100]);
    expect((await read(redis)).families.desktop.ranked).toBe(false);
  });
});

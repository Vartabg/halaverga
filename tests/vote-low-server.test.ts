import { afterEach, describe, expect, it, vi } from 'vitest';
import * as apiResults from '@/app/api/results/route';
import * as apiVote from '@/app/api/vote/route';
import { respondResults } from '@/app/results/respond';
import * as resultsRoute from '@/app/results/route';
import { VOTE_ROUND } from '@/lib/vote/ballot';
import { encodeEntry } from '@/lib/vote/entry';
import { createResultsCache, RESULTS_MAX_STALE_MS, RESULTS_RETRY_MS } from '@/server/vote/cachedResults';
import { handleVote } from '@/server/vote/handlers';
import { readResults, handleResults, type ResultsReader } from '@/server/vote/results';
import { utcHour } from '@/server/vote/limits';
import { FakeRedis } from './fixtures/fake-redis';
import { blockIp, CTL, D, NS, T0, VOTES, json, setup, vote, voteBody, voteReq } from './helpers/voteBody';

// Third-review low findings, server side (spec-final 19). Every title names the finding id; each fails on the tree before the fix.
afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });
const entry = (i: number) => encodeEntry({ device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow'], last: 'flow' }, utcHour(T0), '0ab').replace(/.$/, String(i % 10));
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('CODE-2 a resend of a stored vote', () => {
  it('is 200 even when the round is full, and it never latches the instance', async () => {
    const s = setup({}, { max: 100 }), body = voteBody();
    expect((await handleVote(voteReq(body), s.deps)).status).toBe(200);
    for (let i = 0; i < 99; i++) s.redis.admin(['HSETNX', VOTES, (i + 1).toString(16).padStart(32, '0'), entry(i)]); // the ceiling is reached
    expect((await vote(s, blockIp(1))).status).toBe(429); // a new ballot is refused
    s.tick(61_000); // the latch has run out
    const r = await handleVote(voteReq(body, { ip: blockIp(2) }), s.deps);
    expect([r.status, Object.keys(s.redis.hash(VOTES)).length]).toEqual([200, 100]); // before: 429 from the ceiling check that ran before the stored-code check
  });
  it('spends no address budget: eight resends after a vote leave the counter at 1 and the next new ballot still counts', async () => {
    const s = setup(), body = voteBody(), ip = '203.0.113.9';
    await handleVote(voteReq(body), s.deps);
    for (let i = 0; i < 7; i++) expect((await handleVote(voteReq(body), s.deps)).status).toBe(200);
    const unit = s.redis.keys().find((k) => k.includes(':rl:u:'))!;
    expect(s.redis.counter(unit)).toBe(1); // before: 8
    expect((await vote(s, ip)).status).toBe(200);
    expect(s.redis.counter(unit)).toBe(2);
  });
  it('is still 200 when the undo fails (the vote is stored; a 502 would only make the card resend)', async () => {
    const s = setup(), body = voteBody();
    await handleVote(voteReq(body), s.deps);
    const exec = s.redis.exec.bind(s.redis);
    vi.spyOn(s.redis, 'exec').mockImplementation(async (cmds, o) => { if (cmds[0][0] === 'DECR') throw new Error('down'); return exec(cmds, o); });
    expect((await handleVote(voteReq(body), s.deps)).status).toBe(200);
  });
});

describe('F5 the latch of the day\'s global limit', () => {
  it('does not outlive UTC midnight: an honest first vote of the new day reaches the store', async () => {
    const s = setup({}, { global: 1 });
    s.tick(9 * 3600e3 + 55 * 60e3 - 30_000); // 23:59:30
    expect((await vote(s)).status).toBe(200);
    expect((await vote(s, blockIp(1))).status).toBe(429); // the limit is spent: the instance latches
    s.tick(35_000); // 00:00:05, 25 s into a 60 s latch
    expect(utcDateOf(s.at())).not.toBe(D);
    expect((await vote(s, blockIp(2))).status).toBe(200); // before: 429 from the latch until 00:00:30
  });
  const utcDateOf = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
});

describe('C6 a well-typed but malformed store reply fails closed', () => {
  it('an empty HMGET ctl reply is a 502, not an open gate (it used to bypass the kill switch)', async () => {
    quiet();
    const s = setup({}, { mode: 'closed' });
    const exec = s.redis.exec.bind(s.redis);
    vi.spyOn(s.redis, 'exec').mockImplementation(async (cmds, o) => { const out = await exec(cmds, o); if (cmds[0][0] === 'HMGET' && cmds.length === 5) out[0] = []; return out; });
    const r = await vote(s);
    expect(r.status).toBe(502);
    expect(Object.keys(s.redis.hash(VOTES))).toEqual([]);
  });
  const run = async (patch: (out: unknown[]) => void) => {
    const redis = new FakeRedis(() => T0), exec = redis.exec.bind(redis);
    vi.spyOn(redis, 'exec').mockImplementation(async (c, o) => { const out = await exec(c, o); patch(out); return out; });
    return readResults(redis, NS, VOTE_ROUND, T0);
  };
  it('the results read refuses an odd HGETALL, a string, null, an object, a non-array void set and a short knob reply', async () => {
    for (const [name, patch] of [
      ['odd', (o: unknown[]) => { o[0] = ['a', 'b', 'c']; }], ['string', (o: unknown[]) => { o[0] = 'nope'; }], ['null', (o: unknown[]) => { o[0] = null; }],
      ['object', (o: unknown[]) => { o[0] = { a: 'b' }; }], ['non-string', (o: unknown[]) => { o[0] = ['a', 1]; }], ['void', (o: unknown[]) => { o[1] = 'x'; }],
      ['ctl empty', (o: unknown[]) => { o[2] = []; }], ['ctl short', (o: unknown[]) => { o[2] = [null]; }],
    ] as const) await expect(run(patch), name).rejects.toThrow('bad reply');
    expect((await run(() => {})).open).toBe(true);
  });
});

describe('WEB-L1 and C2 one snapshot for every route bundle', () => {
  it('two copies of the module (as two route bundles are) share one cache: a page read then an API read is one 3-command read', async () => {
    const redis = new FakeRedis(() => T0);
    const a = await import('@/server/vote/cachedResults');
    vi.resetModules(); // the second route bundle gets its own module instance
    const b = await import('@/server/vote/cachedResults');
    expect(a).not.toBe(b);
    await a.cachedRead(redis, NS, VOTE_ROUND);
    await b.cachedRead(redis, NS, VOTE_ROUND);
    expect([redis.execCalls, redis.commands]).toEqual([1, 3]); // before: 2 and 6
    const c1 = (await import('@/server/vote/config')).depsFromEnv({}), c2 = (vi.resetModules(), await import('@/server/vote/config')).depsFromEnv({});
    expect([c1.memo === c2.memo, c1.latch === c2.latch]).toEqual([true, true]);
  });
});

describe('C5 and R6 a snapshot does not outlive an outage, and a failure leaves a signal', () => {
  const rig = () => {
    let now = T0, fail = false, reads = 0;
    const read: ResultsReader = async (_s, _n, _r, at) => { reads++; if (fail) throw new Error('WRONGTYPE'); return readResults(new FakeRedis(), NS, VOTE_ROUND, at ?? now); };
    return { cache: createResultsCache(read, undefined, () => now), tick: (ms: number) => { now += ms; }, fail: (f: boolean) => { fail = f; }, reads: () => reads };
  };
  it('serves the stale copy for 10 minutes after its read, then the error; logs one fixed line per failed refresh', async () => {
    const err = quiet(), r = rig(), store = new FakeRedis();
    const first = await r.cache(store, NS, VOTE_ROUND);
    r.fail(true); r.tick(120_001);
    expect(await r.cache(store, NS, VOTE_ROUND)).toBe(first);
    expect(err.mock.calls).toEqual([['[vote] results refresh failed']]);
    r.tick(RESULTS_MAX_STALE_MS - 120_001 - RESULTS_RETRY_MS - 1); // just under 10 minutes from the read
    expect(await r.cache(store, NS, VOTE_ROUND)).toBe(first);
    r.tick(RESULTS_RETRY_MS + 2); // past it, and the retry window is open
    await expect(r.cache(store, NS, VOTE_ROUND)).rejects.toThrow();
    r.tick(1_000); // inside the retry hold: still the error, no read
    const n = r.reads();
    await expect(r.cache(store, NS, VOTE_ROUND)).rejects.toThrow();
    expect(r.reads()).toBe(n);
    r.fail(false); r.tick(RESULTS_RETRY_MS + 1);
    expect((await r.cache(store, NS, VOTE_ROUND)).open).toBe(true); // recovers on the first refresh after the key is fixed
  });
  it('R6 a mistyped void, vote or ctl key (WRONGTYPE) is a store error, so the API says 502 and the page says it could not reach the store', async () => {
    quiet();
    for (const key of [`${NS}:void:${VOTE_ROUND}:s3`, `${NS}:vote:${VOTE_ROUND}:s3`, CTL]) {
      const redis = new FakeRedis(() => T0);
      redis.admin(['SET', key, 'typo']);
      const deps = { store: redis, ns: NS }, read = createResultsCache(readResults, undefined, () => T0);
      expect((await handleResults(deps, read)).status, key).toBe(502);
      expect((await respondResults(deps, read)).status, key).toBe(502);
    }
  });
});

describe('CODE-6, WEB-L2, R5, C4 the results answers the CDN may keep, and the ones it may not', () => {
  const ok = async () => readResults(new FakeRedis(), NS, VOTE_ROUND, T0);
  it('a tally is public for 120 s; a failed read (502) and a store that is not set up (503) are no-store, so an error page cannot be pinned at the edge', async () => {
    quiet();
    const good = await respondResults({ store: new FakeRedis(), ns: NS }, ok);
    expect([good.status, good.headers.get('cache-control'), good.headers.get('content-type')]).toEqual([200, 'public, max-age=0, s-maxage=120', 'text/html; charset=utf-8']);
    const html = await good.text();
    expect(html).toMatch(/^<!doctype html><html lang="en"><head>/); expect(html).toContain('<title>Halaverga vote results</title>'); expect(html).toContain('noindex');
    expect(html).not.toMatch(/<script/i);
    const failed = await respondResults({ store: new FakeRedis(), ns: NS }, async () => { throw new Error('down'); });
    expect([failed.status, failed.headers.get('cache-control'), failed.headers.get('retry-after')]).toEqual([502, 'no-store', '5']);
    expect(await failed.text()).toContain('reach the vote store');
    const unset = await respondResults({ store: null, ns: NS }, ok);
    expect([unset.status, unset.headers.get('cache-control'), unset.headers.get('retry-after')]).toEqual([503, 'no-store', '60']);
    expect(await unset.text()).toMatch(/set up on this deployment/);
    const api = await handleResults({ store: new FakeRedis(), ns: NS }, async () => { throw new Error('down'); });
    expect([api.status, api.headers.get('cache-control')]).toEqual([502, 'no-store']);
  });
  it('P3 every method /results does not serve is a 405 with Allow: GET, HEAD, OPTIONS and no-store, and OPTIONS lists only those (the same for /api/results)', async () => {
    for (const m of [resultsRoute, apiResults]) {
      expect(Object.keys(m).filter((k) => /^[A-Z]+$/.test(k)).sort()).toEqual(['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
      for (const name of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
        const r = (m[name] as () => Response)();
        expect([r.status, r.headers.get('allow'), r.headers.get('cache-control')], name).toEqual([405, 'GET, HEAD, OPTIONS', 'no-store']);
      }
      const o = (m.OPTIONS as () => Response)();
      expect([o.status, o.headers.get('allow')]).toEqual([204, 'GET, HEAD, OPTIONS']);
    }
    await expect(json(apiVote.GET() as Response)).resolves.toMatchObject({ status: 405 });
  });
});

describe('P6 two Content-Type values', () => {
  it('a joined header (json then text/plain) is not json: 415 at 0 commands. Node keeps only the first duplicate before Next builds the Request, so the handler cannot see the second', async () => {
    const s = setup();
    const r = await handleVote(voteReq(voteBody(), { headers: { 'content-type': 'application/json, text/plain' } }), s.deps);
    expect([r.status, s.redis.commands]).toEqual([415, 0]);
  });
});

import { describe, expect, it } from 'vitest';
import { GLOBAL_LIMIT, IP_LIMIT, handleVote, type VoteDeps } from '@/server/vote/handlers';
import { MemoLimit } from '@/server/vote/memoLimit';
import { handleResults, readResults, toResults } from '@/server/vote/results';
import { VOTE_ROUND, type VoteResults } from '@/lib/vote/shape';
import { FakeRedis } from './fixtures/fake-redis';

const T0 = Date.UTC(2026, 8, 25, 14, 5);
const NS = 'hv:test';
const SERVER = '2026-09-25 · b649104';
const H = `${NS}:vote:${VOTE_ROUND}`;
const good = { favorite: 'conduct', ratings: { conduct: 5, brush: 2 }, tried: ['brush', 'conduct'], device: 'desktop', build: SERVER };

function setup(over: Partial<VoteDeps> = {}) {
  let now = T0;
  const redis = new FakeRedis(() => now);
  const deps: VoteDeps = { store: redis, salt: 'test-salt', ns: NS, serverBuild: SERVER, now: () => now, memo: new MemoLimit(), ...over };
  return { redis, deps, tick: (ms: number) => { now += ms; } };
}

function req(body: unknown = good, opts: { ip?: string; headers?: Record<string, string> } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://halaverga.test/api/vote', {
    method: 'POST', body: text,
    headers: { host: 'halaverga.test', origin: 'https://halaverga.test', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-forwarded-for': `${opts.ip ?? '203.0.113.9'}, 10.0.0.1`, ...opts.headers },
  });
}
const json = async (r: Response) => ({ status: r.status, body: await r.json() });

describe('handleVote', () => {
  it('reports 503 voting-not-set-up without a store', async () => {
    const { deps } = setup({ store: null });
    expect(await json(await handleVote(req(), deps))).toEqual({ status: 503, body: { ok: false, error: 'voting-not-set-up' } });
  });

  it('refuses cross-site requests with 403', async () => {
    const { deps, redis } = setup();
    expect((await handleVote(req(good, { headers: { 'sec-fetch-site': 'cross-site' } }), deps)).status).toBe(403);
    expect((await handleVote(req(good, { headers: { origin: 'https://evil.example' } }), deps)).status).toBe(403);
    expect((await handleVote(req(good, { headers: { origin: 'null' } }), deps)).status).toBe(403);
    expect(redis.execCalls).toBe(0);
    // Behind a proxy the forwarded host counts too.
    const proxied = req(good, { headers: { host: 'internal:3000', 'x-forwarded-host': 'halaverga.test' } });
    expect((await handleVote(proxied, deps)).status).toBe(200);
  });

  it('needs JSON by media type, with parameters allowed', async () => {
    const { deps } = setup();
    expect((await handleVote(req(good, { headers: { 'content-type': 'text/plain' } }), deps)).status).toBe(415);
    expect((await handleVote(req(good, { headers: { 'content-type': 'application/json; charset=utf-8' } }), deps)).status).toBe(200);
  });

  it('gives 413 for a declared or actual body over 2048 bytes', async () => {
    const { deps } = setup();
    expect((await handleVote(req(good, { headers: { 'content-length': '5000' } }), deps)).status).toBe(413);
    expect((await handleVote(req({ ...good, note: 'x'.repeat(2100) }), deps)).status).toBe(413);
  });

  it('gives 400 bad-vote for bad JSON or a bad shape', async () => {
    const { deps } = setup();
    expect(await json(await handleVote(req('{nope'), deps))).toEqual({ status: 400, body: { ok: false, error: 'bad-vote' } });
    expect((await handleVote(req({ ...good, favorite: 'draw' }), deps)).status).toBe(400);
  });

  it('refuses the 21st vote from one IP within the hour as too-many', async () => {
    const { deps } = setup();
    for (let i = 0; i < IP_LIMIT; i++) expect((await handleVote(req(), deps)).status).toBe(200);
    expect(await json(await handleVote(req(), deps))).toEqual({ status: 429, body: { ok: false, error: 'too-many' } });
  });

  it('counts one IPv6 /64 as one address: rotating through a /64 hits too-many after 20 (review 2026-09-25)', async () => {
    const { deps } = setup();
    for (let i = 0; i < IP_LIMIT; i++) expect((await handleVote(req(good, { ip: `2001:db8:1:2::${(i + 1).toString(16)}` }), deps)).status).toBe(200);
    expect(await json(await handleVote(req(good, { ip: '2001:db8:1:2:abcd::99' }), deps))).toEqual({ status: 429, body: { ok: false, error: 'too-many' } });
    expect((await handleVote(req(good, { ip: '2001:db8:1:3::1' }), deps)).status).toBe(200); // a neighbouring /64 still votes
  });

  it('a retried Send (same nonce) is counted once; a failed write frees the nonce so the retry counts (review 2026-09-25)', async () => {
    const { deps, redis } = setup(), nonce = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect((await handleVote(req({ ...good, nonce }), deps)).status).toBe(200);
    expect(await json(await handleVote(req({ ...good, nonce }), deps))).toEqual({ status: 200, body: { ok: true } });
    const total = async () => (await readResults(redis, NS, VOTE_ROUND)).total;
    expect(await total()).toBe(1);
    expect((await handleVote(req({ ...good, nonce: nonce.replace('0f', '1f') }), deps)).status).toBe(200);
    expect(await total()).toBe(2);
    expect(JSON.stringify(redis.log)).not.toContain('"nonce"'); // the nonce is a key, never stored with the vote
    // The tally write fails after the nonce was taken: the nonce is released, so the client's retry is counted.
    const n2 = 'aaaaaaaaaaaaaaaaaaaa', flaky = setup(), real = flaky.redis.exec.bind(flaky.redis);
    let calls = 0;
    flaky.redis.exec = async (cmds) => { if (cmds.some(c => c[0] === 'HINCRBY') && calls++ === 0) throw new Error('down'); return real(cmds); };
    expect((await handleVote(req({ ...good, nonce: n2 }), flaky.deps)).status).toBe(502);
    expect((await handleVote(req({ ...good, nonce: n2 }), flaky.deps)).status).toBe(200);
    expect((await readResults(flaky.redis, NS, VOTE_ROUND)).total).toBe(1);
  });

  it('checks the per-IP limit in Upstash too, for other instances (no shared memo)', async () => {
    const { deps, redis } = setup();
    for (let i = 0; i < IP_LIMIT; i++) await handleVote(req(), { ...deps, memo: new MemoLimit() });
    const r = await json(await handleVote(req(), { ...deps, memo: new MemoLimit() }));
    expect(r).toEqual({ status: 429, body: { ok: false, error: 'too-many' } });
    const global = redis.keys().find((k) => k.startsWith(`${NS}:rlg:`))!;
    expect(redis.counter(global)).toBe(IP_LIMIT);
  });

  it('one spammer cannot lock out the vote: 1000 requests leave the global counter at 20 and IP B still votes (B1)', async () => {
    const { deps, redis } = setup();
    for (let i = 0; i < 1000; i++) await handleVote(req(good, { ip: '198.51.100.1' }), i % 2 ? deps : { ...deps, memo: new MemoLimit() });
    const global = redis.keys().find((k) => k.startsWith(`${NS}:rlg:`))!;
    expect(redis.counter(global)).toBeLessThanOrEqual(IP_LIMIT);
    expect((await handleVote(req(good, { ip: '198.51.100.2' }), deps)).status).toBe(200);
  });

  it('makes no store call once the instance memo has tripped', async () => {
    const { deps, redis } = setup();
    for (let i = 0; i <= IP_LIMIT; i++) await handleVote(req(), deps);
    const calls = redis.execCalls;
    for (let i = 0; i < 50; i++) expect((await handleVote(req(), deps)).status).toBe(429);
    expect(redis.execCalls).toBe(calls);
  });

  it('refuses the 601st passing vote in the hour as busy', async () => {
    const { deps, redis } = setup();
    for (let i = 0; i < GLOBAL_LIMIT; i++) {
      expect((await handleVote(req(good, { ip: `10.1.${i >> 8}.${i & 255}` }), deps)).status).toBe(200);
    }
    expect(await json(await handleVote(req(good, { ip: '192.0.2.77' }), deps))).toEqual({ status: 429, body: { ok: false, error: 'busy' } });
    expect(redis.hash(H).total).toBe(GLOBAL_LIMIT);
  });

  it('writes the tally fields, and notes only when there is a note', async () => {
    const { deps, redis } = setup();
    expect(await json(await handleVote(req(), deps))).toEqual({ status: 200, body: { ok: true } });
    expect(redis.hash(H)).toEqual({
      total: 1, 'fav:conduct': 1, 'favdev:desktop:conduct': 1, 'dev:desktop': 1,
      'tried:brush': 1, 'tried:conduct': 1, 'rsum:conduct': 5, 'rn:conduct': 1, 'rsum:brush': 2, 'rn:brush': 1,
    });
    expect(redis.keys().some((k) => k.includes(':notes:'))).toBe(false);

    await handleVote(req({ ...good, build: 'old tab', note: 'loved the whirl' }, { ip: '203.0.113.50' }), deps);
    const h = redis.hash(H);
    expect(h.stale).toBe(1);
    expect(h.notes).toBe(1);
    const notesKey = `${NS}:notes:${VOTE_ROUND}:20260925`;
    expect(redis.list(notesKey).map((s) => JSON.parse(s))).toEqual([{ favorite: 'conduct', device: 'desktop', note: 'loved the whirl' }]);
    const ttl = (await redis.exec([['TTL', notesKey]]))[0] as number;
    expect(ttl).toBeGreaterThan(89 * 86400);
    expect(ttl).toBeLessThanOrEqual(90 * 86400);
    expect(redis.log).toContainEqual(['LTRIM', notesKey, 0, 199]);
    expect(redis.log).toContainEqual(['EXPIRE', notesKey, 7776000]);
  });

  it('counts builds under the server stamp, never the client hint', async () => {
    const { deps, redis } = setup();
    await handleVote(req({ ...good, build: 'client says 1999' }), deps);
    expect(redis.hash(`${NS}:builds:${VOTE_ROUND}`)).toEqual({ [SERVER]: 1 });
    expect(JSON.stringify(redis.log)).not.toContain('client says 1999');
  });

  it('gives 502 store-failed when the store throws', async () => {
    const { deps, redis } = setup();
    redis.failWith = new Error('boom');
    expect(await json(await handleVote(req(), deps))).toEqual({ status: 502, body: { ok: false, error: 'store-failed' } });
  });

  it('never echoes the note, IP or build in a response body', async () => {
    const { deps } = setup();
    const secretish = { ...good, build: 'build-xyz', note: 'my private note' };
    for (const r of [req(secretish, { ip: '192.0.2.200' }), req({ ...secretish, extra: 1 }, { ip: '192.0.2.200' })]) {
      const text = await (await handleVote(r, deps)).text();
      for (const bad of ['my private note', '192.0.2.200', 'build-xyz']) expect(text).not.toContain(bad);
    }
  });
});

describe('results', () => {
  it('aggregates, rounds averages to 0.1 and hides them under 3 ratings', async () => {
    const { deps, redis } = setup();
    const votes = [
      { favorite: 'draw', ratings: { draw: 5 }, tried: ['draw'], device: 'touch' },
      { favorite: 'draw', ratings: { draw: 4 }, tried: ['draw', 'brush'], device: 'touch' },
      { favorite: 'brush', ratings: { draw: 4, brush: 3 }, tried: ['draw', 'brush'], device: 'desktop' },
    ];
    for (const [i, v] of votes.entries()) await handleVote(req({ ...v, build: SERVER }, { ip: `192.0.2.${i}` }), deps);
    const res = await readResults(redis, NS, VOTE_ROUND);
    expect(res.total).toBe(3);
    expect(res.favorite).toEqual({ standard: 0, draw: 2, conduct: 0, brush: 1 });
    expect(res.favoriteByDevice.touch.draw).toBe(2);
    expect(res.favoriteByDevice.desktop.brush).toBe(1);
    expect(res.rating.draw).toEqual({ avg: 4.3, n: 3 });
    expect(res.rating.brush).toEqual({ avg: null, n: 1 });
    expect(res.tried).toEqual({ standard: 0, draw: 3, conduct: 0, brush: 2 });
    expect(res.device).toEqual({ touch: 2, desktop: 1 });
    expect(res.builds).toEqual({ [SERVER]: 3 });
    expect(res.notes).toBe(0);
    expect(res.stale).toBe(0);
  });

  it('serves the injected reader with a 30 s shared cache header, and 503 without a store', async () => {
    const { deps } = setup();
    const fixed: VoteResults = toResults('r1', { total: 2, 'fav:draw': 2 }, {});
    let seen: [string, string] | null = null;
    const r = await handleResults(deps, async (_s, ns, round) => { seen = [ns, round]; return fixed; });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
    expect(await r.json()).toEqual(fixed);
    expect(seen).toEqual([NS, VOTE_ROUND]);
    const none = await handleResults({ ...deps, store: null });
    expect(await json(none)).toEqual({ status: 503, body: { ok: false, error: 'voting-not-set-up' } });
    const broken = await handleResults(deps, async () => { throw new Error('down'); });
    expect(broken.status).toBe(502);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNeonStore } from '@/server/vote/neonStore';
import { handleResults } from '@/server/vote/results';
import type { VoteStore } from '@/server/vote/store';
import { FakeNeon } from './helpers/fakeNeon';
import { CS, HOST, PW, USER } from './helpers/neonKit';
import { fakeNeonBackend, handlerScenarios, redisBackend, VOID } from './helpers/handlerScenarios';
import { nonce } from './helpers/voteAgg';
import { CTL, setup, vote, VOTES } from './helpers/voteBody';

// Handler level: handleVote and the results reader over the Neon adapter, against an in-process endpoint that speaks the documented
// SQL-over-HTTP contract, next to the same script over FakeRedis. The two backends must give the same answers and the same stored votes.
function neonSetup(ctl: Record<string, string> = {}) {
  const s = setup();
  const neon = new FakeNeon(s.at, CS);
  s.deps.store = createNeonStore(CS, neon.fetch, undefined, s.at);
  for (const [k, v] of Object.entries(ctl)) neon.setHash(CTL, k, v);
  return { ...s, neon };
}
type Env = ReturnType<typeof neonSetup>;

// Nothing logs except the one constant error line of a store failure, and only the tests that expect it may see it.
let quiet: ReturnType<typeof vi.spyOn>[], err: ReturnType<typeof vi.spyOn>, errOk = false;
beforeEach(() => { errOk = false; err = vi.spyOn(console, 'error').mockImplementation(() => {}); quiet = (['log', 'info', 'warn', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {})); });
afterEach(() => { for (const q of quiet) expect(q).not.toHaveBeenCalled(); if (!errOk) expect(err).not.toHaveBeenCalled(); vi.restoreAllMocks(); });

describe.each([['FakeRedis', redisBackend], ['the in-process Neon endpoint', fakeNeonBackend]])('the vote handler over %s', (_name, make) => { handlerScenarios(make); });

describe('over Neon: what the wire sees', () => {
  it('a vote is three requests (gate A with the DDL first, gate B, the write), a second vote three with no DDL, and the endpoint has no complaint', async () => {
    const s = neonSetup();
    expect((await vote(s)).status).toBe(200);
    expect(s.neon.calls.map((c) => c.queries.length)).toEqual([5 + 5 + 1, 6, 1]); // DDL + gate A + CLEAN (SET and INCR ride the first), gate B, write
    expect((await vote(s, '198.51.100.9')).status).toBe(200);
    expect(s.neon.calls.slice(3).map((c) => c.queries.length)).toEqual([5, 6, 1]);
    expect(s.neon.violations).toEqual([]);
    expect(s.redis.execCalls).toBe(0);
    const [entry] = Object.values(s.neon.hash(VOTES));
    expect(entry).toHaveLength(18);
  });

  it('keys land in the table of their type and never share a name: rl (unit, block, round) and rlg in hv_kv, vote and ctl in hv_hash, void in hv_set', async () => {
    const s = neonSetup({ cap: '5' });
    await vote(s);
    s.neon.addMember(VOID, 'x');
    expect(await handleResultsOk(s)).toBe(200);
    const kv = [...s.neon.st.kv.keys()], hash = [...s.neon.st.hash.keys()], set = [...s.neon.st.set.keys()];
    expect(kv.every((k) => /^hv:test:rlg?:/.test(k))).toBe(true);
    expect(kv).toHaveLength(4); // unit, block, round, day
    expect(hash.sort()).toEqual([CTL, VOTES]);
    expect(set).toEqual([VOID]);
    expect(new Set([...kv, ...hash, ...set]).size).toBe(kv.length + hash.length + set.length);
  });

  it('every store call gets the adapter budget, 3 s, at most what is left of the 6 s handler deadline', async () => {
    const s = neonSetup();
    const budgets: (number | undefined)[] = [];
    const inner = s.deps.store!;
    const wrapped: VoteStore = { callBudgetMs: inner.callBudgetMs, exec: (c, o) => { budgets.push(o?.timeoutMs); return inner.exec(c, o); } };
    s.deps.store = wrapped;
    await vote(s);
    expect(budgets).toEqual([3000, 3000, 3000]);
  });

  it('a store failure is 502 store-failed, Retry-After 5, latched for 5 s, and one constant log line with nothing of the connection', async () => {
    errOk = true;
    const s = neonSetup();
    s.neon.hooks.push(() => new Response(`{"message":"${PW} ${USER} ${HOST}"}`, { status: 500 }));
    const r = await vote(s);
    expect([r.status, r.headers.get('retry-after')]).toEqual([502, '5']);
    expect(await r.json()).toEqual({ ok: false, error: 'store-failed' });
    const before = s.neon.calls.length;
    expect((await vote(s, '198.51.100.9')).status).toBe(502);
    expect(s.neon.calls.length).toBe(before);
    expect(err.mock.calls).toEqual([['[vote] store request failed']]);
    s.tick(5001);
    expect((await vote(s, '198.51.100.9')).status).toBe(200);
    for (const m of [PW, USER, HOST, CS]) expect(JSON.stringify(err.mock.calls)).not.toContain(m);
  });

  it('a timeout after apply then the same nonce: 502 first, then 200, and one entry stored', async () => {
    errOk = true;
    const s = neonSetup();
    const n = nonce();
    // the write commits but its reply never arrives: the hook lets the batch run, then reports a network failure
    let calls = 0;
    const real = s.neon.fetch;
    s.neon.fetch = async (u, i) => { const res = await real(u, i); if (++calls === 3) throw new TypeError(`reply lost ${HOST}`); return res; };
    s.deps.store = createNeonStore(CS, (u, i) => s.neon.fetch(u, i), undefined, s.at);
    expect((await vote(s, '203.0.113.9', { nonce: n })).status).toBe(502);
    expect(Object.keys(s.neon.hash(VOTES))).toEqual([n]);
    s.tick(5001);
    expect((await vote(s, '203.0.113.9', { nonce: n })).status).toBe(200);
    expect(Object.keys(s.neon.hash(VOTES))).toEqual([n]);
  });

  it('dropped tables heal: the vote after a 42P01 answers 502 once, then 200 with the tables recreated', async () => {
    errOk = true;
    const s = neonSetup();
    expect((await vote(s)).status).toBe(200);
    s.neon.drop();
    expect((await vote(s, '198.51.100.9')).status).toBe(502);
    s.tick(5001);
    expect((await vote(s, '198.51.100.9')).status).toBe(200);
    expect(Object.keys(s.neon.hash(VOTES))).toHaveLength(1);
  });

  it('results over Neon: 200 with the cache header, 502 with a constant line for a malformed reply', async () => {
    const s = neonSetup();
    const ok = await handleResults(s.deps);
    expect([ok.status, ok.headers.get('cache-control')]).toEqual([200, 'public, max-age=0, s-maxage=120']);
    expect(await ok.json()).toMatchObject({ v: 3, open: true });
    errOk = true;
    s.neon.hooks.push(() => Response.json({ results: [{ rows: [] }] }));
    expect((await handleResults(s.deps)).status).toBe(502);
    expect(err.mock.calls).toEqual([['[vote] results read failed']]);
  });
});

async function handleResultsOk(s: Env) { return (await handleResults(s.deps)).status; }

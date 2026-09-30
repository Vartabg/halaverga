import { expect, it } from 'vitest';
import { encodeEntry } from '@/lib/vote/entry';
import { createNeonStore } from '@/server/vote/neonStore';
import { readResults } from '@/server/vote/results';
import { FakeNeon } from './fakeNeon';
import { CS } from './neonKit';
import type { Pg } from './pgHttp';
import { nonce, tag } from './voteAgg';
import { blockIp, CTL, json, NS, setup, T0, vote, VOTES, type Setup } from './voteBody';

// One set of handler scenarios, run over every backend: FakeRedis, the in-process Neon endpoint, and a real local PostgreSQL.
// The assertions are the same for all three, so a backend that answers differently fails the same test.
export const VOID = `${NS}:void:r3:s3`;
export interface Backend {
  s: Setup;
  votes(): Promise<Record<string, string>>;
  ctl(fields: Record<string, string>): Promise<void>;
  unctl(field: string): Promise<void>;
  voided(member: string): Promise<void>;
  seed(nonce: string, entry: string): Promise<void>;
  calls(): number;
}
export type MakeBackend = () => Promise<Backend>;

export const redisBackend: MakeBackend = async () => {
  const s = setup();
  return {
    s, calls: () => s.redis.execCalls, votes: async () => s.redis.hash(VOTES) as Record<string, string>,
    ctl: async (f) => s.setCtl(f), unctl: async (f) => { s.redis.admin(['HDEL', CTL, f]); },
    voided: async (m) => { s.redis.admin(['SADD', VOID, m]); }, seed: async (n, e) => { s.redis.admin(['HSETNX', VOTES, n, e]); },
  };
};
export const fakeNeonBackend: MakeBackend = async () => {
  const s = setup(), neon = new FakeNeon(s.at, CS);
  s.deps.store = createNeonStore(CS, neon.fetch, undefined, s.at);
  return {
    s, calls: () => neon.calls.length, votes: async () => neon.hash(VOTES),
    ctl: async (f) => { for (const [k, v] of Object.entries(f)) neon.setHash(CTL, k, v); }, unctl: async (f) => neon.delHash(CTL, f),
    voided: async (m) => neon.addMember(VOID, m), seed: async (n, e) => neon.setHash(VOTES, n, e),
  };
};
/** A real Postgres: the tables are dropped first, so every test also goes through lazy creation. The owner's edits are the runbook SQL. */
export const pgBackend = (pg: Pg): MakeBackend => async () => {
  await pg.sql('DROP TABLE IF EXISTS public.hv_kv, public.hv_hash, public.hv_set;');
  const s = setup();
  s.deps.store = createNeonStore(CS, pg.fetch, undefined, s.at);
  const put = (k: string, pairs: [string, string][]) => pg.sql(`INSERT INTO public.hv_hash (k, field, value) VALUES ${pairs.map(([f, v]) => `('${k}','${f}','${v}')`).join(',')} ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;`);
  const ensure = () => pg.sql(`SELECT 1`).then(() => s.deps.store!.exec([['HLEN', 'x']])); // the tables exist before the owner's first edit
  return {
    s, calls: () => pg.requests(),
    votes: async () => Object.fromEntries((await pg.sql(`SELECT field || '|' || value FROM public.hv_hash WHERE k = '${VOTES}'`)).split('\n').filter(Boolean).map((l) => l.split('|'))),
    ctl: async (f) => { await ensure(); await put(CTL, Object.entries(f)); }, unctl: async (f) => { await pg.sql(`DELETE FROM public.hv_hash WHERE k = '${CTL}' AND field = '${f}';`); },
    voided: async (m) => { await ensure(); await pg.sql(`INSERT INTO public.hv_set (k, member) VALUES ('${VOID}','${m}') ON CONFLICT DO NOTHING;`); },
    seed: async (n, e) => { await ensure(); await put(VOTES, [[n, e]]); },
  };
};

const codes = (rs: Response[]) => rs.reduce<Record<number, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});

/** Registers the scenarios as tests in the current describe. */
export function handlerScenarios(make: MakeBackend) {
  it('F2 one IPv4 counts at most 8 a day: 100 requests, 8 counted, the rest 429, and 8 stored', async () => {
    const b = await make(), out: Response[] = [];
    for (let i = 0; i < 100; i++) out.push(await vote(b.s, '203.0.113.9'));
    expect(codes(out)).toEqual({ 200: 8, 429: 92 });
    expect(Object.keys(await b.votes())).toHaveLength(8);
    expect(await json(out[99])).toEqual({ status: 429, body: { ok: false, error: 'later' } });
  });

  it('F6 the same nonce sent again answers 200 and is stored once, the first pick standing', async () => {
    const b = await make(), n = nonce();
    expect((await vote(b.s, '203.0.113.9', { nonce: n, favorite: 'flow' })).status).toBe(200);
    expect((await vote(b.s, '203.0.113.9', { nonce: n, favorite: 'cursor' })).status).toBe(200);
    const stored = await b.votes();
    expect(Object.keys(stored)).toEqual([n]);
    expect(stored[n]).toMatch(/^2026093014d2/); // flow is index 2 of the desktop registry; cursor (0) would have stored d0
  });

  it('F4 the global limit: with global 10, 30 votes from fresh blocks store exactly 10, then every vote is 429 (latched, no store call)', async () => {
    const b = await make();
    await b.ctl({ global: '10' });
    const out: Response[] = [];
    for (let i = 0; i < 30; i++) out.push(await vote(b.s, blockIp(i)));
    expect(codes(out)).toEqual({ 200: 10, 429: 20 });
    expect(Object.keys(await b.votes())).toHaveLength(10);
    const before = b.calls();
    for (let i = 30; i < 40; i++) expect((await vote(b.s, blockIp(i))).status).toBe(429);
    expect(b.calls()).toBe(before);
  });

  it('atk:4 F3 a vote over a limit is refused honestly: 429 later, nothing stored, Retry-After the true seconds to UTC midnight', async () => {
    const b = await make();
    await b.ctl({ unit: '1' });
    expect((await vote(b.s)).status).toBe(200);
    const r = await vote(b.s);
    expect([r.status, r.headers.get('retry-after'), r.headers.get('cache-control')]).toEqual([429, '35700', 'no-store']); // T0 is 14:05 UTC
    expect(await r.json()).toEqual({ ok: false, error: 'later' });
    expect(Object.keys(await b.votes())).toHaveLength(1);
  });

  it('40 concurrent votes with global 25 store exactly 25 and refuse 15 (exact counters under real concurrency)', async () => {
    const b = await make();
    await b.ctl({ global: '25' });
    const out = await Promise.all(Array.from({ length: 40 }, (_, i) => vote(b.s, blockIp(i))));
    expect(codes(out)).toEqual({ 200: 25, 429: 15 });
    expect(Object.keys(await b.votes())).toHaveLength(25);
  });

  it('the kill switch: mode closed answers 503 closed, the latch holds it 30 s, deleting the row reopens', async () => {
    const b = await make();
    expect((await vote(b.s)).status).toBe(200);
    await b.ctl({ mode: 'closed' });
    const r = await vote(b.s, '198.51.100.7');
    expect([r.status, r.headers.get('retry-after'), (await r.json()).error]).toEqual([503, '60', 'closed']);
    b.s.tick(31_000);
    await b.unctl('mode');
    expect((await vote(b.s, '198.51.100.7')).status).toBe(200);
  });

  it('the reader: 40 entries from 14 groups, a void, cap and minv from ctl, give the answer the FakeRedis reader gives', async () => {
    const seedAll = async (b: Backend) => {
      for (let i = 0; i < 40; i++) await b.seed((i + 1).toString(16).padStart(32, '0'), encodeEntry({ device: 'desktop', favorite: i % 3 ? 'flow' : 'cursor', tried: ['cursor', 'flow'], last: 'flow' }, '2026093014', tag(i % 14)));
      await b.voided(`T:20260930:${tag(3)}`);
      await b.ctl({ cap: '4', minv: '20' });
      return JSON.stringify(await readResults(b.s.deps.store!, NS, 'r3', T0));
    };
    const [want, got] = [await seedAll(await redisBackend()), await seedAll(await make())];
    expect(got).toBe(want);
    const r = JSON.parse(got);
    expect([r.families.desktop.ranked, r.families.desktop.votes > 20, r.open]).toEqual([true, true, true]);
  });
}

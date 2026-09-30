import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLEAN, DDL } from '@/server/vote/neonSchema';
import { createNeonStore } from '@/server/vote/neonStore';
import { gateA, gateB } from '@/server/vote/gate';
import { CTL_FIELDS } from '@/server/vote/limits';
import type { Command, VoteStore } from '@/server/vote/store';
import { FakeRedis } from '../fixtures/fake-redis';
import { CS } from '../helpers/neonKit';
import { hasPg, startPg, type Pg } from '../helpers/pgHttp';

// Reply parity: the same scripted batches through FakeRedis and through the Neon adapter over a real PostgreSQL, replies compared with
// toEqual. This is what proves the seven SQL statements and the row mappers.
const NS = 'hv:t', D = '20260930', RT = 'r3:s3';
const V = `${NS}:vote:${RT}`, C = `${NS}:ctl`, S = `${NS}:void:${RT}`, UNIT = `${NS}:rl:u:${D}:aaaaaa`, BLOCK = `${NS}:rl:b:${D}:bbbbbb`;
const keys = { unit: 'aaaaaa', block: 'bbbbbb', round: 'cccccc' };
const NULLS8 = Array(8).fill(null);

describe.skipIf(!hasPg)('reply parity: FakeRedis and Neon over a real PostgreSQL', () => {
  let pg: Pg, clock = 1_000_000_000_000, redis: FakeRedis, neon: VoteStore;
  beforeAll(async () => { pg = await startPg(); });
  afterAll(async () => { await pg?.stop(); });
  beforeAll(() => { redis = new FakeRedis(() => clock); });
  beforeAll(() => { neon = createNeonStore(CS, (u, i) => pg.fetch(u, i), undefined, () => clock); });

  /** Runs the batch on both stores, asserts the replies are equal and returns them. */
  const both = async (cmds: Command[], label: string) => {
    const [r, n] = [await redis.exec(cmds), await neon.exec(cmds)];
    expect(n, label).toEqual(r);
    return n;
  };
  const sorted = (flat: unknown) => { const a = flat as string[], p: string[] = []; for (let i = 0; i < a.length; i += 2) p.push(`${a[i]}=${a[i + 1]}`); return p.sort(); };

  it('gate A on a fresh key, again, then gate B: the counters count the same', async () => {
    const nonce = 'c'.repeat(32);
    expect(await both(gateA(NS, RT, D, keys, nonce), 'A1')).toEqual([NULLS8, 0, [null], 'OK', 1]);
    expect(await both(gateA(NS, RT, D, keys, nonce), 'A2')).toEqual([NULLS8, 0, [null], null, 2]);
    expect(await both(gateB(NS, D, keys), 'B1')).toEqual(['OK', 1, 'OK', 1, 'OK', 1]);
    expect(await both(gateB(NS, D, keys), 'B2')).toEqual([null, 2, null, 2, null, 2]);
    expect(await both([['INCR', UNIT], ['INCR', UNIT]], 'incr')).toEqual([3, 4]);
  });

  it('HSETNX stores once and leaves the first value; HLEN, HMGET and HGETALL agree', async () => {
    const n1 = 'a'.repeat(32), n2 = 'b'.repeat(32);
    expect(await both([['HSETNX', V, n1, '2026093014d2857a3f']], 'new')).toEqual([1]);
    expect(await both([['HSETNX', V, n1, 'SECOND-VALUE-XXXX']], 'again')).toEqual([0]);
    expect(await both([['HSETNX', V, n2, '2026093015t415201c']], 'second')).toEqual([1]);
    expect(await both([['HMGET', V, n1, 'nope', n2]], 'hmget')).toEqual([['2026093014d2857a3f', null, '2026093015t415201c']]);
    expect(await both([['HLEN', V]], 'hlen')).toEqual([2]);
    const [r, n] = [await redis.exec([['HGETALL', V]]), await neon.exec([['HGETALL', V]])];
    expect(sorted(n[0])).toEqual(sorted(r[0]));
    expect(n[0]).toEqual([n1, '2026093014d2857a3f', n2, '2026093015t415201c']); // the adapter orders by field, byte for byte
  });

  it('the owner sets knobs: HMGET of the seven ctl fields reads them, and a void member lists', async () => {
    redis.admin(['HSET', C, 'mode', 'closed', 'cap', 3]);
    await pg.sql(`INSERT INTO public.hv_hash (k, field, value) VALUES ('${C}','mode','closed'),('${C}','cap','3') ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;`);
    expect(await both([['HMGET', C, ...CTL_FIELDS]], 'ctl')).toEqual([['closed', null, null, null, null, '3', null]]);
    redis.admin(['SADD', S, 'T:20260930:a3f', '2026093014']);
    await pg.sql(`INSERT INTO public.hv_set (k, member) VALUES ('${S}','T:20260930:a3f'),('${S}','2026093014') ON CONFLICT DO NOTHING;`);
    const [r, n] = [await redis.exec([['SMEMBERS', S]]), await neon.exec([['SMEMBERS', S]])];
    expect((n[0] as string[]).slice().sort()).toEqual((r[0] as string[]).slice().sort());
    expect(n[0]).toEqual(['2026093014', 'T:20260930:a3f']);
  });

  it('HMGET keeps the order of the requested fields, 600 fields in a shuffled order with gaps', async () => {
    const h = `${NS}:big`, fields = Array.from({ length: 600 }, (_, i) => `f${((i * 7919) % 600).toString(36)}-${i % 3}`);
    const stored = fields.filter((_, i) => i % 4 !== 0);
    await both(stored.map((f) => ['HSETNX', h, f, `v-${f}`] as Command), 'seed');
    // a big table with fresh statistics, so the planner is free to pick a join that does not keep the order of the field list
    await pg.sql(`INSERT INTO public.hv_hash SELECT 'hv:t:filler', 'x' || g, 'y' FROM generate_series(1, 60000) g; ANALYZE public.hv_hash;`);
    const asked = [...fields].reverse().concat(['nope-1', 'nope-2']);
    // FakeRedis caps HMGET at 99 arguments, so the expected reply is computed, and FakeRedis answers the same in slices of 90
    const want = asked.map((f) => (stored.includes(f) ? `v-${f}` : null));
    expect((await neon.exec([['HMGET', h, ...asked]]))[0]).toEqual(want);
    const sliced = [];
    for (let i = 0; i < asked.length; i += 90) sliced.push(...((await redis.exec([['HMGET', h, ...asked.slice(i, i + 90)]]))[0] as unknown[]));
    expect(sliced).toEqual(want);
  });

  it('a missing hash and a missing set: nulls, 0 and empty arrays for every read command', async () => {
    const m = `${NS}:none`;
    expect(await both([['HMGET', m, 'a', 'b'], ['HLEN', m], ['HGETALL', m], ['SMEMBERS', m]], 'missing')).toEqual([[null, null], 0, [], []]);
  });

  it('expiry by the database clock: after 25 h an expired counter restarts at 1 on INCR and SET NX takes it again', async () => {
    const b2 = `${BLOCK}x`;
    await both([['SET', b2, 0, 'EX', 90000, 'NX'], ['INCR', b2]], 'seed');
    clock += 90_001_000; redis.clock = () => clock;
    await pg.advance(90_001_000);
    expect(await both([['INCR', UNIT]], 'expired incr')).toEqual([1]);
    expect(await both([['INCR', UNIT]], 'and again')).toEqual([2]); // restarted with no expiry
    expect(await both([['SET', b2, 0, 'EX', 90000, 'NX']], 'expired set nx')).toEqual(['OK']);
    expect(await both([['SET', b2, 0, 'EX', 90000, 'NX'], ['INCR', b2]], 'live set nx')).toEqual([null, 1]);
    expect(await both([['SET', `${NS}:rlg:${D}`, 0, 'EX', 2592000, 'NX']], '30 day counter is live')).toEqual([null]);
  });

  it('documented non-parity: an INCR on a non-integer fails both, but Postgres rolls the whole batch back and Redis keeps the first command', async () => {
    await both([['SET', `${NS}:str`, 'abc', 'EX', 100, 'NX']], 'string');
    const batch: Command[] = [['INCR', `${NS}:cnt`], ['INCR', `${NS}:str`]];
    await expect(redis.exec(batch)).rejects.toThrow('vote store command failed');
    await expect(neon.exec(batch)).rejects.toMatchObject({ message: 'vote store http 400', sqlstate: '22P02' });
    expect(redis.counter(`${NS}:cnt`)).toBe(1);
    expect(await pg.sql(`SELECT count(*) FROM public.hv_kv WHERE k = '${NS}:cnt'`)).toBe('0');
  });

  it('atomic batch: an entry that fails leaves no trace of the entries before it', async () => {
    const before = await pg.sql('SELECT count(*) FROM public.hv_hash');
    await expect(neon.exec([['HSETNX', `${NS}:h`, 'f', 'v'], ['INCR', `${NS}:str`]])).rejects.toThrow();
    expect(await pg.sql('SELECT count(*) FROM public.hv_hash')).toBe(before);
  });

  it('hostile text is data: a quote-laden key and value round trip and no table is dropped', async () => {
    const k = `${NS}:x'); DROP TABLE public.hv_hash; --`, v = `it's "\\ \n ; $1 \u{1F680}`;
    expect(await neon.exec([['HSETNX', k, "f'`", v], ['HGETALL', k], ['HMGET', k, "f'`", 'zz']])).toEqual([1, ["f'`", v], [v, null]]);
    expect(await pg.sql("SELECT to_regclass('public.hv_hash') IS NOT NULL")).toBe('t');
  });

  it('the cleanup entry deletes expired rows and only those', async () => {
    let t = 0;
    const s = createNeonStore(CS, (u, i) => pg.fetch(u, i), undefined, () => t);
    await s.exec([['SET', 'cl:old', 0, 'EX', 10, 'NX'], ['SET', 'cl:new', 0, 'EX', 100000, 'NX']]); // the first batch carries CLEAN, nothing to delete yet
    await pg.advance(11_000);
    t += 700_000;
    await s.exec([['INCR', 'cl:other']]); // CLEAN is due again
    expect(await pg.sql("SELECT string_agg(k, ',' ORDER BY k) FROM public.hv_kv WHERE k LIKE 'cl:%'")).toBe('cl:new,cl:other');
    expect(CLEAN).toContain('SKIP LOCKED');
  });

  it('the DDL: idempotent, and 12 parallel first requests from 12 store instances all succeed', async () => {
    await pg.sql('DROP TABLE IF EXISTS public.hv_kv, public.hv_hash, public.hv_set;');
    const first = createNeonStore(CS, (u, i) => pg.fetch(u, i));
    expect(await first.exec([['INCR', 'ddl:a']])).toEqual([1]);
    expect(await createNeonStore(CS, (u, i) => pg.fetch(u, i)).exec([['INCR', 'ddl:a']])).toEqual([2]); // a second instance, tables already there
    await pg.sql('DROP TABLE IF EXISTS public.hv_kv, public.hv_hash, public.hv_set;');
    const out = await Promise.all(Array.from({ length: 12 }, (_, i) => createNeonStore(CS, (u, x) => pg.fetch(u, x)).exec([['INCR', `ddl:p${i}`]])));
    expect(out).toEqual(Array(12).fill([1]));
    expect(DDL).toHaveLength(5);
    expect(pg.violations).toEqual([]);
  });
});

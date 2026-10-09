import { describe, expect, it, vi } from 'vitest';
import type { VoteResults } from '@/lib/vote/ballot';
import { aggregate } from '@/server/vote/aggregate';
import { createResultsCache, RESULTS_RETRY_MS, RESULTS_TTL_MS } from '@/server/vote/cachedResults';
import { readResults, type ResultsReader } from '@/server/vote/results';
import { FakeRedis } from './fixtures/fake-redis';
import { NS, T0 } from './helpers/voteBody';

const snap = (at: number): VoteResults => aggregate([], [], { cap: 5, minVotes: 30 }, at, true);
const store = new FakeRedis();

function rig(ttl?: number) {
  let now = T0, reads = 0, fail = false, gate: Promise<void> | null = null;
  const read: ResultsReader = async (_s, _ns, _r, at) => {
    reads++;
    if (gate) await gate;
    if (fail) throw new Error('down');
    return snap(at ?? now);
  };
  const cache = createResultsCache(read, ttl, () => now);
  return { cache, reads: () => reads, tick: (ms: number) => { now += ms; }, fail: (f: boolean) => { fail = f; }, hold: () => { let go!: () => void; gate = new Promise((r) => { go = r; }); return () => { gate = null; go(); }; } };
}
const get = (c: ResultsReader, ns = NS) => c(store, ns, 'r3');

describe('createResultsCache', () => {
  it('serves a fresh snapshot with no read, for 120 s', async () => {
    expect(RESULTS_TTL_MS).toBe(120_000);
    const r = rig();
    const first = await get(r.cache);
    r.tick(119_999);
    expect(await get(r.cache)).toBe(first);
    expect(r.reads()).toBe(1);
  });

  it('cost:C4 300 concurrent requests at expiry make one read, and all get the same answer', async () => {
    const r = rig(), release = r.hold();
    const all = Promise.all(Array.from({ length: 300 }, () => get(r.cache)));
    release();
    const out = await all;
    expect(r.reads()).toBe(1);
    expect(new Set(out).size).toBe(1);
    r.tick(120_001);
    const again = r.hold();
    const next = Promise.all(Array.from({ length: 300 }, () => get(r.cache)));
    again();
    await next;
    expect(r.reads()).toBe(2);
  });

  it('R7 asOf is the read time, and a snapshot older than the TTL is awaited, never served', async () => {
    const r = rig();
    const a = await get(r.cache);
    expect(a.asOf).toBe('2026-09-30T14:05:00Z');
    r.tick(120_000);
    const b = await get(r.cache);
    expect(b).not.toBe(a);
    expect(b.asOf).toBe('2026-09-30T14:07:00Z');
  });

  it('cost:C4 a failing store is not retried within 15 s: the stale snapshot is served, its asOf honest', async () => {
    expect(RESULTS_RETRY_MS).toBe(15_000);
    const r = rig(), old = await get(r.cache);
    r.fail(true); r.tick(120_001);
    expect(await get(r.cache)).toBe(old); // the request that met the failure gets the stale copy too
    expect(r.reads()).toBe(2);
    for (let i = 0; i < 50; i++) expect(await get(r.cache)).toBe(old);
    expect(r.reads()).toBe(2);
    r.tick(14_999);
    await get(r.cache);
    expect(r.reads()).toBe(2);
    r.fail(false); r.tick(2);
    const fresh = await get(r.cache);
    expect([r.reads(), fresh === old]).toEqual([3, false]);
  });

  it('with no snapshot a failure is an error, and it is not retried within 15 s either', async () => {
    const r = rig();
    r.fail(true);
    await expect(get(r.cache)).rejects.toThrow();
    for (let i = 0; i < 20; i++) await expect(get(r.cache)).rejects.toThrow();
    expect(r.reads()).toBe(1);
    r.tick(15_001); r.fail(false);
    expect((await get(r.cache)).open).toBe(true);
    expect(r.reads()).toBe(2);
  });

  it('a reader that throws before returning a promise is handled the same way', async () => {
    const read = vi.fn(() => { throw new Error('sync'); }) as unknown as ResultsReader;
    await expect(get(createResultsCache(read))).rejects.toThrow('sync');
  });

  it('does not serve one namespace or round from another', async () => {
    const r = rig();
    const a = await get(r.cache, 'hv:a');
    expect(await get(r.cache, 'hv:b')).not.toBe(a);
    expect(r.reads()).toBe(2);
  });

  it('through the real reader: 300 concurrent requests are one exec of exactly 3 commands', async () => {
    const redis = new FakeRedis(() => T0);
    const cache = createResultsCache(readResults, undefined, () => T0);
    const out = await Promise.all(Array.from({ length: 300 }, () => cache(redis, NS, 'r3')));
    expect([redis.execCalls, redis.commands, new Set(out).size]).toEqual([1, 3, 1]);
    await cache(redis, NS, 'r3');
    expect(redis.commands).toBe(3);
  });
});

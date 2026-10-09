import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeEntry } from '@/lib/vote/entry';
import { handleResults, readResults } from '@/server/vote/results';
import { FakeRedis } from './fixtures/fake-redis';
import { CTL, NS, T0, VOTES } from './helpers/voteBody';
import { nonce, tag } from './helpers/voteAgg';

const VOID = `${NS}:void:r3:s3`;
const HOUR = '2026093014';
afterEach(() => vi.restoreAllMocks());

/** `n` desktop ballots, flow over cursor, spread over `groups` network groups (tags from `from`). */
function seed(redis: FakeRedis, n: number, groups = 12, from = 0x100) {
  redis.admin(['HSET', CTL, 'minv', 30, 'cap', 10]); // these scenarios are about 30 votes (the default floor is 300) in groups of up to 3: cap 10 keeps them whole (the favorite cap, 4, is R1's and is tested in vote-fix-round2)
  for (let i = 0; i < n; i++) redis.admin(['HSETNX', VOTES, nonce(), encodeEntry({ device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow'], last: 'flow' }, HOUR, tag(from + (i % groups) - 0x100))]);
}

describe('readResults', () => {
  it('reads the vote hash, the void set and the eight knobs in one exec of exactly 3 commands', async () => {
    const redis = new FakeRedis(() => T0);
    await readResults(redis, NS, 'r3', T0);
    expect(redis.log).toEqual([['HGETALL', VOTES], ['SMEMBERS', VOID], ['HMGET', CTL, 'mode', 'unit', 'block', 'global', 'max', 'cap', 'minv', 'round']]);
    expect([redis.execCalls, redis.commands]).toEqual([1, 3]);
  });

  it('an empty store gives two unranked families with nulls, open, and the read time', async () => {
    const r = await readResults(new FakeRedis(), NS, 'r3', T0);
    expect(r).toMatchObject({ v: 3, round: 'r3', asOf: '2026-09-30T14:05:00Z', open: true });
    expect(r.families.touch).toEqual({ votes: 0, ranked: false, tie: null, order: null, controls: null, lastFlown: null });
    expect(r.families.desktop).toEqual(r.families.touch);
  });

  it('R2 below the floor the JSON has no per-control numbers; 30 votes from 12 groups rank the family with counts', async () => {
    const redis = new FakeRedis();
    seed(redis, 29);
    const low = await readResults(redis, NS, 'r3', T0);
    expect(low.families.desktop).toMatchObject({ votes: 25, ranked: false, controls: null, order: null });
    expect(JSON.stringify(low)).not.toMatch(/heldHours|notes|build|stale/);
    seed(redis, 1);
    const up = await readResults(redis, NS, 'r3', T0);
    expect(up.families.desktop).toMatchObject({ votes: 30, ranked: true, tie: 0 });
    expect(up.families.desktop.order![0]).toBe('flow');
    expect(up.families.desktop.controls!.flow).toEqual({ picked: 30, tried: 30, rate: 100 }); // R2: no wins or losses are published
    expect(Object.keys(up.families.desktop.controls!)).toHaveLength(8);
  });

  it('V1 with no ctl row the default floor is 300: 299 votes publish a count and nothing else, 300 rank and carry the order check', async () => {
    const ballots = (n: number) => { // one ballot per network group, Cursor started and Flow flown last, picks split evenly
      const redis = new FakeRedis();
      for (let i = 0; i < n; i++) redis.admin(['HSETNX', VOTES, nonce(), encodeEntry({ device: 'desktop', favorite: i % 2 ? 'flow' : 'cursor', tried: ['cursor', 'flow'], last: 'flow' }, HOUR, tag(i))]);
      return redis;
    };
    expect((await readResults(ballots(299), NS, 'r3', T0)).families.desktop).toEqual({ votes: 295, ranked: false, tie: null, order: null, controls: null, lastFlown: null });
    const up = (await readResults(ballots(300), NS, 'r3', T0)).families.desktop;
    expect(up).toMatchObject({ votes: 300, ranked: true, lastFlown: { n: 300, last: 50, first: 50, even: 50 } });
    expect(up.controls).not.toBeNull();
  });

  it('ctl mode sets open, and cap and minv are read from ctl: 12 groups of 3 rank at minv 30 but not once cap 2 counts them for 12', async () => {
    const redis = new FakeRedis();
    seed(redis, 36);
    expect((await readResults(redis, NS, 'r3', T0)).families.desktop).toMatchObject({ votes: 35, ranked: true });
    redis.admin(['HSET', CTL, 'cap', 2, 'mode', 'closed']);
    const r = await readResults(redis, NS, 'r3', T0);
    expect([r.open, r.families.desktop.ranked, r.families.desktop.votes]).toEqual([false, false, 10]); // cap 2: scale 2/3, and one favorite weighs at most 1 in a group, so 12
    redis.admin(['HSET', CTL, 'cap', 'nonsense', 'minv', 10, 'mode', 'open']);
    expect(await readResults(redis, NS, 'r3', T0)).toMatchObject({ open: true, families: { desktop: { ranked: true, votes: 20 } } }); // cap back to 5: 12 groups x 2 (the favorite cap)
  });

  it('applies the void set on the next read: a group for a day goes, SREM brings it back', async () => {
    const redis = new FakeRedis();
    seed(redis, 36);
    redis.admin(['SADD', VOID, `T:20260930:${tag(0)}`, 'not-a-member']);
    expect((await readResults(redis, NS, 'r3', T0)).families.desktop.ranked).toBe(false); // 11 groups left
    redis.admin(['SREM', VOID, `T:20260930:${tag(0)}`]);
    expect((await readResults(redis, NS, 'r3', T0)).families.desktop.ranked).toBe(true);
  });

  it('R2 published counts are multiples of 5 and no two columns add back to the exact ballot count, however many ballots are stored', async () => {
    for (const n of [31, 32, 33, 34, 37]) {
      const redis = new FakeRedis();
      seed(redis, n, 30, 0x100);
      redis.admin(['HSETNX', VOTES, nonce(), encodeEntry({ device: 'desktop', favorite: 'tie', tried: ['cursor', 'flow'], last: 'flow' }, HOUR, tag(1))]);
      const f = (await readResults(redis, NS, 'r3', T0)).families.desktop, cs = Object.values(f.controls!);
      const all = [f.votes, f.tie!, ...cs.flatMap((c) => [c.picked, c.tried])];
      expect(all.every((x) => x % 5 === 0), `n=${n}`).toBe(true);
      expect(JSON.stringify(f)).not.toMatch(/wins|losses/);
      expect(cs.reduce((a, c) => a + c.picked, 0) + f.tie!).not.toBe(n + 1); // the columns never re-add to the exact count (n + 1 ballots are stored)
    }
  });

  it('F3 open is false once the vote hash holds `max` entries, so the card says voting is closed instead of "try again later"', async () => {
    const redis = new FakeRedis();
    seed(redis, 100);
    expect((await readResults(redis, NS, 'r3', T0)).open).toBe(true);
    redis.admin(['HSET', CTL, 'max', 100]);
    expect((await readResults(redis, NS, 'r3', T0)).open).toBe(false);
    redis.admin(['HSET', CTL, 'max', 101]);
    expect((await readResults(redis, NS, 'r3', T0)).open).toBe(true);
  });

  it('R9 a botched hand edit is skipped, never rendered', async () => {
    const redis = new FakeRedis();
    seed(redis, 30);
    const clean = await readResults(redis, NS, 'r3', T0);
    redis.admin(['HSET', VOTES, 'a'.repeat(32), 'garbage', 'b'.repeat(32), '-33', 'c'.repeat(32), '2026093014dx052b2']);
    const r = await readResults(redis, NS, 'r3', T0);
    expect(r).toEqual(clean);
    expect(JSON.stringify(r)).not.toMatch(/[:,\[]-\d/);
  });

  it('refuses a reply it cannot read, and an unknown round', async () => {
    await expect(readResults({ exec: async () => [[], []] }, NS, 'r3')).rejects.toThrow();
    await expect(readResults({ exec: async () => [[], [], 'x'] }, NS, 'r3')).rejects.toThrow();
    await expect(readResults(new FakeRedis(), NS, 'r2')).rejects.toThrow();
  });
});

describe('handleResults', () => {
  it('answers 503 closed with no store, no-store, Retry-After 60, and reads nothing', async () => {
    const read = vi.fn();
    const r = await handleResults({ store: null, ns: NS }, read);
    expect([r.status, r.headers.get('cache-control'), r.headers.get('retry-after'), read.mock.calls.length]).toEqual([503, 'no-store', '60', 0]);
    expect(await r.json()).toEqual({ ok: false, error: 'closed' });
  });

  it('serves the reader result with the shared CDN header, no stale-while-revalidate and no cookie', async () => {
    const redis = new FakeRedis(() => T0);
    seed(redis, 30);
    const r = await handleResults({ store: redis, ns: NS }, (s, ns, round) => readResults(s, ns, round, T0));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=120');
    expect(r.headers.get('set-cookie')).toBeNull();
    expect((await r.json()).families.desktop.ranked).toBe(true);
  });

  it('a failing read is 502 store-failed, no-store, Retry-After 5, and logs one line with no data', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await handleResults({ store: new FakeRedis(), ns: NS }, async () => { throw new Error('boom https://x tok-secret'); });
    expect([r.status, r.headers.get('cache-control'), r.headers.get('retry-after')]).toEqual([502, 'no-store', '5']);
    expect(await r.json()).toEqual({ ok: false, error: 'store-failed' });
    expect(err.mock.calls).toEqual([['[vote] results read failed']]);
  });
});

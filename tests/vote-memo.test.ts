import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '@/server/vote/limits';
import { Latch, MEMO_CAP, MemoLimit, PROBE_MS } from '@/server/vote/memo';

const D1 = '20260930', D2 = '20261001';

describe('MemoLimit', () => {
  it('counts attempts per key and day', () => {
    const m = new MemoLimit();
    expect([1, 2, 3].map(() => m.attempt('a', D1))).toEqual([1, 2, 3]);
    expect(m.attempt('b', D1)).toBe(1);
    expect(m.attempt('a', D1)).toBe(4);
    expect(m.size).toBe(2);
  });

  it('is over only when attempts exceed twice the limit: 16 pass and the 17th is refused on a unit key of 8', () => {
    const m = new MemoLimit();
    for (let i = 1; i <= 16; i++) { m.attempt('u', D1); expect(m.over('u', D1, 8), `attempt ${i}`).toBe(false); }
    m.attempt('u', D1);
    expect(m.over('u', D1, 8)).toBe(true);
    m.attempt('u', D1);
    expect(m.over('u', D1, 8)).toBe(true);
  });

  it('gives a block key of 60 room for 120 attempts, and refuses the 121st', () => {
    const m = new MemoLimit();
    for (let i = 1; i <= 120; i++) { m.attempt('b', D1); expect(m.over('b', D1, 60), `attempt ${i}`).toBe(false); }
    m.attempt('b', D1);
    expect(m.over('b', D1, 60)).toBe(true);
  });

  it('uses the limit it is given: the same count is under a raised limit and over a lowered one', () => {
    const m = new MemoLimit();
    for (let i = 0; i < 17; i++) m.attempt('k', D1);
    expect(m.over('k', D1, 8)).toBe(true);
    expect(m.over('k', D1, 9)).toBe(false);
    expect(m.over('k', D1, 200)).toBe(false);
    expect(m.over('k', D1, 1)).toBe(true);
  });

  it('reads without counting, and knows nothing of an unseen key', () => {
    const m = new MemoLimit();
    expect(m.over('never', D1, 1)).toBe(false);
    for (let i = 0; i < 100; i++) m.over('never', D1, 1);
    expect(m.size).toBe(0);
    m.attempt('x', D1);
    for (let i = 0; i < 100; i++) m.over('x', D1, 1);
    expect(m.attempt('x', D1)).toBe(2);
  });

  it('PRIV-6: no entry survives its day', () => {
    const m = new MemoLimit();
    for (let i = 0; i < 50; i++) m.attempt(`key${i}`, D1);
    expect(m.size).toBe(50);
    expect(m.attempt('fresh', D2)).toBe(1);
    expect(m.size).toBe(1);
    expect(m.over('key1', D2, 1)).toBe(false);
    for (let i = 0; i < 30; i++) m.attempt('u', D2);
    expect(m.over('u', D2, 8)).toBe(true);
    expect(m.over('u', D1, 8)).toBe(false); // a call for another day sees nothing of today's counts
    expect(m.size).toBe(0);
  });

  it('starts a same-named key at 1 on a new day', () => {
    const m = new MemoLimit();
    for (let i = 0; i < 20; i++) m.attempt('k', D1);
    expect(m.attempt('k', D2)).toBe(1);
    expect(m.over('k', D2, 8)).toBe(false);
  });

  it('evicts the least recently seen key once over its cap', () => {
    const m = new MemoLimit(3);
    m.attempt('a', D1); m.attempt('b', D1); m.attempt('c', D1);
    m.attempt('a', D1); // a is now the most recent
    m.attempt('d', D1); // evicts b
    expect(m.size).toBe(3);
    expect(m.attempt('a', D1)).toBe(3);
    expect(m.attempt('c', D1)).toBe(2);
    expect(m.attempt('b', D1)).toBe(1); // b was evicted, and starts over
  });

  it('cost:C11 rotating keys evict an abusive key, which then starts from 1 again (accepted, it reaches gate A)', () => {
    const m = new MemoLimit(50);
    for (let i = 0; i < 40; i++) m.attempt('abusive', D1);
    expect(m.over('abusive', D1, 8)).toBe(true);
    for (let i = 0; i < 60; i++) m.attempt(`rot${i}`, D1);
    expect(m.size).toBe(50);
    expect(m.over('abusive', D1, 8)).toBe(false);
    expect(m.attempt('abusive', D1)).toBe(1);
  });

  it('keeps an abusive key while it keeps trying, even under rotation', () => {
    const m = new MemoLimit(50);
    for (let i = 0; i < 20; i++) m.attempt('abusive', D1);
    for (let i = 0; i < 200; i++) { m.attempt(`rot${i}`, D1); m.attempt('abusive', D1); }
    expect(m.over('abusive', D1, 8)).toBe(true);
    expect(m.size).toBe(50);
  });

  it('holds at most its cap however many keys arrive, and defaults to 5,000', () => {
    expect(MEMO_CAP).toBe(5000);
    const m = new MemoLimit();
    for (let i = 0; i < 6000; i++) m.attempt(`k${i}`, D1);
    expect(m.size).toBe(5000);
  });

  it('remembers the last limits it was given, starting from the defaults, per instance', () => {
    const m = new MemoLimit();
    expect(m.limits).toEqual(DEFAULT_LIMITS);
    m.limits = { ...m.limits, unit: 3 };
    expect(new MemoLimit().limits.unit).toBe(8);
    expect(DEFAULT_LIMITS.unit).toBe(8);
  });
});

describe('Latch', () => {
  it('answers from memory until the time is up, then lets a request through (which is the one probe, see C1)', () => {
    const l = new Latch();
    expect(l.check(0)).toBeNull();
    l.set(1000, 503, 'closed', 60);
    expect(l.check(0)).toEqual({ status: 503, error: 'closed', retryAfter: 60 });
    expect(l.check(999)).toEqual({ status: 503, error: 'closed', retryAfter: 60 });
    expect(l.check(1000)).toBeNull();
  });

  it('holds each kind: closed 503, global or ceiling 429, store error 502', () => {
    const l = new Latch();
    l.set(60_000, 429, 'later', 300);
    expect(l.check(1)).toEqual({ status: 429, error: 'later', retryAfter: 300 });
    l.set(160_000, 502, 'store-failed', 5);
    expect(l.check(100_000)).toEqual({ status: 502, error: 'store-failed', retryAfter: 5 });
  });

  it('lets the later expiry win: a short 502 never cuts a longer latch short', () => {
    const l = new Latch();
    l.set(60_000, 429, 'later', 300);
    l.set(5_000, 502, 'store-failed', 5);
    expect(l.check(10_000)).toEqual({ status: 429, error: 'later', retryAfter: 300 });
    l.set(90_000, 503, 'closed', 60);
    expect(l.check(70_000)).toEqual({ status: 503, error: 'closed', retryAfter: 60 });
  });

  it('takes a short latch once the old one has run out, even if nobody checked in between', () => {
    const l = new Latch();
    l.set(1_000, 503, 'closed', 60);
    l.set(105_000, 502, 'store-failed', 5); // set at now = 100,000: the old latch expired unnoticed
    expect(l.check(101_000)).toEqual({ status: 502, error: 'store-failed', retryAfter: 5 });
    expect(l.check(105_000)).toBeNull();
  });

  it('is per instance', () => {
    const a = new Latch(), b = new Latch();
    a.set(1000, 503, 'closed', 60);
    expect(b.check(0)).toBeNull();
  });
});

describe('Latch half open (C1: one probe per expiry, not one per request in flight)', () => {
  const held = { status: 503, error: 'closed', retryAfter: 60 };
  it('C1 at the expiry exactly one claim goes through; every other claim keeps the latched answer until the probe settles', () => {
    const l = new Latch();
    l.set(1000, 503, 'closed', 60);
    expect(l.claim(500)).toEqual(held); // before the expiry a claim is just the latched answer
    const out = Array.from({ length: 300 }, () => l.claim(1000));
    expect(out.filter((x) => x === null)).toHaveLength(1);
    expect(out.filter((x) => x !== null)).toHaveLength(299);
    expect(l.check(1001)).toEqual(held); // a plain check during the probe is latched too
    l.settle();
    expect(l.check(1002)).toBeNull();
    expect(l.claim(1002)).toBeNull();
  });
  it('C1 a probe that never answers frees the latch after PROBE_MS: the next claim probes again, once', () => {
    const l = new Latch();
    l.set(0, 502, 'store-failed', 5);
    expect(l.claim(10)).toBeNull();
    expect(l.claim(10 + PROBE_MS - 1)).toEqual({ status: 502, error: 'store-failed', retryAfter: 5 });
    expect([l.claim(10 + PROBE_MS), l.claim(10 + PROBE_MS)].map((x) => x === null)).toEqual([true, false]);
  });
  it('C1 the probe that fails re-latches (a short 502 replaces the stale hit), and the probe that answers clears it', () => {
    const l = new Latch();
    l.set(1000, 429, 'later', 300);
    expect(l.claim(1000)).toBeNull();
    l.set(1000 + 5000, 502, 'store-failed', 5); // shorter than the probe deadline, and it must still replace the stale 429
    expect(l.check(2000)).toEqual({ status: 502, error: 'store-failed', retryAfter: 5 });
    expect(l.check(6000)).toBeNull();
    expect(l.claim(6000)).toBeNull(); // the 5 s are up: one probe again
    l.settle();
    expect(l.claim(6001)).toBeNull();
    expect(l.check(6001)).toBeNull();
  });
  it('a settle by a request that did not probe leaves a fresh latch alone', () => {
    const l = new Latch();
    l.set(10_000, 503, 'closed', 60);
    l.settle(); // e.g. an older request whose store call succeeded just as another set the latch
    expect(l.check(1)).toEqual(held);
  });
  it('a null Retry-After is kept as null', () => {
    const l = new Latch();
    l.set(100, 429, 'later', null);
    expect(l.check(0)).toEqual({ status: 429, error: 'later', retryAfter: null });
  });
});

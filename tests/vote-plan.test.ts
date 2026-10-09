import { describe, expect, it } from 'vitest';
import { controlsFor, type ControlFamily, type ControlId } from '@/game/controlTypes';
import { ballotOptions, readSeed, SEED_KEY, shuffleIds, SUGGEST_SKIP, suggestNext } from '@/ui/vote/ballotPlan';
import type { VoteStorage } from '@/ui/vote/voteTracker';

function memory(seed: Record<string, string> = {}): VoteStorage & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const throwing: VoteStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
const ids = (f: ControlFamily) => controlsFor(f).map(c => c.id);
const seeds = Array.from({ length: 300 }, (_, i) => i * 7919 + 3);
/** A small deterministic generator for the subsets below (the test's own, not the module's). */
const lcg = (n: number) => () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296;

describe('client:C1 the ballot order is seeded, never current-first, and only lists what was flown', () => {
  it('shuffleIds is a permutation, deterministic for a seed, different across seeds, and leaves its input alone', () => {
    const input = ['a', 'b', 'c', 'd', 'e'], before = [...input];
    for (const s of seeds.slice(0, 50)) {
      const out = shuffleIds(input, s);
      expect([...out].sort()).toEqual(before);
      expect(shuffleIds(input, s)).toEqual(out);
    }
    expect(input).toEqual(before);
    expect(new Set(seeds.map(s => shuffleIds(input, s).join(''))).size).toBeGreaterThan(60);
    expect(shuffleIds([], 5)).toEqual([]);
    expect(shuffleIds(['x'], 5)).toEqual(['x']);
  });

  it('pins the algorithm: the same seed gives the same order on every build, so a visitor keeps their order', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    expect(shuffleIds(five, 0)).toEqual(['e', 'c', 'd', 'a', 'b']);
    expect(shuffleIds(five, 1)).toEqual(['e', 'c', 'b', 'a', 'd']);
    expect(shuffleIds(five, 42)).toEqual(['a', 'e', 'c', 'b', 'd']);
    expect(shuffleIds(five, 4294967295)).toEqual(['d', 'b', 'c', 'a', 'e']);
  });

  it('offers exactly the flown controls of the family, once each, in the seeded order', () => {
    const offered: ControlId[] = ['brush', 'one-finger', 'draw'];
    for (const s of seeds.slice(0, 60)) {
      const out = ballotOptions(offered, 'touch', s);
      expect([...out].sort()).toEqual([...offered].sort());
      expect(ballotOptions(offered, 'touch', s)).toEqual(out);
    }
    // Ids of the other family, unknown ids and repeats are dropped.
    expect([...ballotOptions(['cursor', 'flow', 'draw', 'draw', 'one-finger', 'nope' as ControlId], 'touch', 9)].sort()).toEqual(['draw', 'one-finger']);
    expect(ballotOptions([], 'touch', 9)).toEqual([]);
  });

  it('the rows already there keep their relative order when one more control is flown', () => {
    for (const s of seeds.slice(0, 100)) {
      const few = ballotOptions(['one-finger', 'draw'], 'touch', s), more = ballotOptions(['one-finger', 'draw', 'brush'], 'touch', s);
      expect(more.filter(id => few.includes(id))).toEqual(few);
    }
  });

  it('the current control is never first (any seed, any offer of two or more) and nothing else moves', () => {
    for (const family of ['touch', 'desktop'] as const) {
      const all = ids(family);
      for (const s of seeds) for (const current of all) {
        const base = ballotOptions(all, family, s), out = ballotOptions(all, family, s, current);
        expect(out[0], `${family} seed ${s} current ${current}`).not.toBe(current);
        expect([...out].sort()).toEqual([...base].sort());
        if (base[0] !== current) expect(out).toEqual(base);
        else expect(out.slice(2)).toEqual(base.slice(2));
      }
    }
    expect(ballotOptions(['draw'], 'touch', 1, 'draw')).toEqual(['draw']); // one row: nothing to swap with
  });

  it('every control leads the ballot about as often as any other (no order that favours one way)', () => {
    const lead: Record<string, number> = {};
    for (let s = 0; s < 2000; s++) { const first = ballotOptions(ids('touch'), 'touch', s * 2654435761)[0]; lead[first] = (lead[first] ?? 0) + 1; }
    for (const id of ids('touch')) expect(lead[id], id).toBeGreaterThan(300); // a fair share is 400
    for (const id of ids('touch')) expect(lead[id], id).toBeLessThan(500);
  });
});

describe('r2p:3 suggestNext never returns flow, captured or mouse-keys, never a tried control, and is null when none is left', () => {
  it('the opt-in list is the three trackpad-specific or pointer-capturing controls', () => {
    expect([...SUGGEST_SKIP].sort()).toEqual(['captured', 'flow', 'mouse-keys']);
  });

  it('is the first control in the seeded order that is untried and not skipped', () => {
    for (const s of seeds.slice(0, 80)) for (const family of ['touch', 'desktop'] as const) {
      const tried: ControlId[] = [ids(family)[0]];
      const want = shuffleIds(ids(family), s).find(id => !tried.includes(id) && !SUGGEST_SKIP.includes(id)) ?? null;
      expect(suggestNext(family, tried, s)).toBe(want);
      expect(suggestNext(family, tried, s)).toBe(suggestNext(family, tried, s));
    }
  });

  it('over random tried sets and seeds: never skipped, never tried, of the family, and null exactly when none is left', () => {
    const rnd = lcg(11);
    for (let i = 0; i < 1500; i++) {
      const family: ControlFamily = rnd() < 0.5 ? 'touch' : 'desktop', s = Math.floor(rnd() * 4294967296);
      const tried = ids(family).filter(() => rnd() < 0.6), left = ids(family).filter(id => !tried.includes(id) && !SUGGEST_SKIP.includes(id));
      const got = suggestNext(family, tried, s);
      if (left.length === 0) expect(got).toBeNull();
      else { expect(got).not.toBeNull(); expect(left).toContain(got); }
    }
  });

  it('is null with everything tried, and with only the opt-in controls left', () => {
    expect(suggestNext('touch', ids('touch'), 5)).toBeNull();
    expect(suggestNext('desktop', ids('desktop'), 5)).toBeNull();
    expect(suggestNext('desktop', ids('desktop').filter(id => !SUGGEST_SKIP.includes(id)), 5)).toBeNull();
    expect(suggestNext('desktop', ids('desktop').filter(id => id !== 'draw'), 5)).toBe('draw');
    expect(suggestNext('touch', [], 5)).not.toBeNull();
  });
});

describe('readSeed', () => {
  it('saves one integer as a plain string and returns the same one every time', () => {
    const s = memory(), a = readSeed(s);
    expect(Number.isInteger(a) && a >= 0 && a <= 0xffffffff).toBe(true);
    expect(SEED_KEY).toBe('halaverga.vote.seed');
    expect(s.data[SEED_KEY]).toBe(String(a));
    expect(readSeed(s)).toBe(a);
  });

  it('returns a seed that is already saved, as is', () => {
    for (const v of ['0', '1', '4294967295', '123456789']) expect(readSeed(memory({ [SEED_KEY]: v }))).toBe(Number(v));
  });

  it('replaces a saved value that is not an integer in range, and saves the replacement', () => {
    for (const v of ['', 'abc', '-1', '1.5', '4294967296', '1e3', ' 5', '5 ', '99999999999', '[1]', '{}']) {
      const s = memory({ [SEED_KEY]: v }), got = readSeed(s);
      expect(Number.isInteger(got) && got >= 0 && got <= 0xffffffff, v).toBe(true);
      expect(s.data[SEED_KEY], v).toBe(String(got));
    }
  });

  it('with no usable storage it never throws and the seed is stable within the page load', () => {
    const a = readSeed(throwing), b = readSeed(throwing), c = readSeed(null);
    for (const n of [a, b, c]) expect(Number.isInteger(n) && n >= 0 && n <= 0xffffffff).toBe(true);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});

import { describe, expect, it } from 'vitest';
import type { ControlId } from '@/game/controlTypes';
import type { VoteDevice, VoteResults } from '@/lib/vote/ballot';
import { aggregate, type ExactResults } from '@/server/vote/aggregate';
import { MINV_DEFAULT } from '@/server/vote/limits';
import { D, H1, H2, NOW, OPTS, agg, ctl, desk, fillers, ids, lcg, min, pairOf, spread, tag, type B } from './helpers/voteAgg';

describe('atk:1 one ballot totals one win-point and one loss-point whatever k', () => {
  // 840 ballots (each its own group, so scale 1): every result below is an exact integer.
  const R = 840;
  const sum = (r: ExactResults, key: 'wins' | 'losses', d: VoteDevice = 'desktop') => Object.values(r.families[d].controls!).reduce((a, c) => a + c[key], 0);
  it('a pick over k tried: the favorite wins R, the rivals lose R/(k-1) each, for k = 2 to 8', () => {
    for (let k = 2; k <= 8; k++) {
      const tried = ids('desktop').slice(0, k);
      const r = agg(spread(R, () => ({ favorite: tried[0], tried })), [], min);
      expect(ctl(r, tried[0]).wins, `k=${k}`).toBe(R);
      expect(ctl(r, tried[0]).losses).toBe(0);
      for (const t of tried.slice(1)) { expect(ctl(r, t).losses, `k=${k}`).toBe(R / (k - 1)); expect(ctl(r, t).wins).toBe(0); }
      expect(sum(r, 'wins')).toBe(R);
      expect(sum(r, 'losses')).toBe(R);
    }
  });
  it('a tie over k tried: each control ends with R/k wins and R/k losses, and the totals are R, for k = 2 to 8', () => {
    for (let k = 2; k <= 8; k++) {
      const tried = ids('desktop').slice(0, k);
      const r = agg(spread(R, () => ({ favorite: 'tie', tried })), [], min);
      for (const t of tried) { expect(ctl(r, t).wins, `k=${k}`).toBe(R / k); expect(ctl(r, t).losses).toBe(R / k); expect(ctl(r, t).picked).toBe(0); }
      expect(sum(r, 'wins')).toBe(R);
      expect(sum(r, 'losses')).toBe(R);
      expect(desk(r).tie).toBe(R);
    }
  });
  it('the worked examples of section 5.1: A over A, B, C gives A 1 win and B, C 0.5 loss each', () => {
    const r = agg(spread(R, () => ({ favorite: 'cursor', tried: ['cursor', 'flow', 'brush'] })), [], min);
    expect([ctl(r, 'cursor').wins, ctl(r, 'flow').losses, ctl(r, 'brush').losses]).toEqual([R, R / 2, R / 2]);
    const eight = agg(spread(R, () => ({ favorite: 'cursor', tried: ids('desktop') })), [], min);
    expect([ctl(eight, 'cursor').wins, ctl(eight, 'flow').losses]).toEqual([R, R / 7]);
  });
  it('touch families weigh the same', () => {
    const tried = ids('touch');
    const r = agg(spread(R, () => ({ device: 'touch', favorite: 'brush', tried })), [], min);
    expect(sum(r, 'wins', 'touch')).toBe(R);
    expect(ctl(r, 'draw', 'touch').losses).toBe(R / 4);
  });
  it('a ballot claiming all 8 moves no control by more than 1 win-point and 1 loss-point', () => {
    const r = agg([...fillers(), { favorite: 'cursor', tried: ids('desktop'), tag: tag(0) }], [], min);
    const base = agg(fillers(), [], min);
    for (const id of ids('desktop')) {
      expect(ctl(r, id).wins - ctl(base, id).wins).toBeLessThanOrEqual(1.05);
      expect(ctl(r, id).losses - ctl(base, id).losses).toBeLessThanOrEqual(1.05);
    }
  });
});

describe('atk:1 one tunnel of 960 all-controls ballots moves a 50% control by at most 10 points', () => {
  // The fixture of round2-sim.mjs (LCG seed 7): 100 honest two-control ballots over 60 groups, each control in about a quarter of them.
  const all = ids('desktop'), T: ControlId = 'captured';
  const rnd = lcg(7);
  const pick = <X,>(a: X[]) => a[Math.floor(rnd() * a.length)];
  const honest: B[] = Array.from({ length: 100 }, (_, i) => {
    const a = pick(all);
    let b: ControlId;
    do { b = pick(all); } while (b === a);
    return { favorite: rnd() < 0.5 ? a : b, tried: [a, b], tag: tag(i % 60) };
  });
  const tunnel = (n: number): B[] => Array.from({ length: n }, () => ({ favorite: T, tried: all, tag: 'a00' }));
  it('the honest ballots alone put the control near 50%', () => {
    expect(ctl(agg(honest, [], { cap: 15, minVotes: 30 }), T).rate).toBe(50);
  });
  it('cap 5: 960 stuffed ballots from one group count for 5 and move it to 58%; cap 100: to 90%', () => {
    const capped = agg([...honest, ...tunnel(960)]);
    expect(ctl(capped, T).rate).toBe(58);
    expect(ctl(capped, T).rate!).toBeLessThan(60);
    expect(desk(capped).votes).toBe(105); // 100 honest + the tunnel scaled to cap 5
    const open = agg([...honest, ...tunnel(960)], [], { cap: 100, minVotes: 30 });
    expect(ctl(open, T).rate).toBe(90);
    expect(ctl(open, T).rate!).toBeGreaterThanOrEqual(85); // proves the cap is what protects
  });
  it('many fresh blocks are not stopped, only priced: 7 fresh groups reach 79%, 25 reach 91% (section 14.1)', () => {
    const fleet = (n: number) => Array.from({ length: n }, (_, b) => tunnel(5).map(x => ({ ...x, tag: tag(100 + b) }))).flat();
    expect(ctl(agg([...honest, ...fleet(7)]), T).rate).toBe(79);
    expect(ctl(agg([...honest, ...fleet(25)]), T).rate).toBe(91);
  });
});

describe('atk:2 a group counts for cap votes a day per family', () => {
  const big = (n: number, over: Partial<B> = {}): B[] => Array.from({ length: n }, () => ({ favorite: 'brush', tried: ['cursor', 'brush'], tag: 'a00', ...over }));
  it('40 entries from one group with cap 5 count for 5, composition unchanged', () => {
    const r = agg([...fillers(), ...big(40)], [], min);
    expect(ctl(r, 'brush').picked).toBe(5);
    expect(ctl(r, 'brush').tried).toBe(5);
    expect(ctl(r, 'cursor').tried).toBe(5);
    expect(ctl(r, 'cursor').losses).toBe(5);
    expect(desk(r).votes).toBe(15); // 12 fillers + 5, rounded down to 5s
    const wide = agg([...fillers(), ...big(40)], [], { cap: 100, minVotes: 10 });
    expect(ctl(wide, 'brush').picked).toBe(40); // cap ignored would look like this
    expect(ctl(agg([...fillers(), ...big(40)], [], { cap: 20, minVotes: 10 }), 'brush').picked).toBe(20);
  });
  it('a group at or under the cap is not scaled', () => {
    for (const n of [1, 4, 5]) expect(ctl(agg([...fillers(), ...big(n)], [], min), 'brush').picked, `n=${n}`).toBe(n);
    expect(ctl(agg([...fillers(), ...big(6)], [], min), 'brush').picked).toBe(5);
  });
  it('a second day is a second group, and touch and desktop groups are separate', () => {
    const r = agg([...fillers(), ...big(40), ...big(40, { hour: '2026100114' })], [], min);
    expect(ctl(r, 'brush').picked).toBe(10);
    const both = agg([...fillers(), ...big(40), ...big(40, { device: 'touch', tried: ['draw', 'brush'] })], [], min);
    expect(ctl(both, 'brush').picked).toBe(5);
    expect(both.families.touch.votes).toBe(5);
    expect(desk(both).votes).toBe(15);
  });
  it('two hours of one day and one group share the cap', () => {
    const r = agg([...fillers(), ...big(40), ...big(40, { hour: H2 })], [], min);
    expect(ctl(r, 'brush').picked).toBe(5);
  });
  it('different groups on one day each count for their own cap', () => {
    const r = agg([...fillers(), ...big(40), ...big(40, { tag: 'a01' }), ...big(40, { tag: 'a02' })], [], min);
    expect(ctl(r, 'brush').picked).toBe(15);
  });
});

describe('aggregate is deterministic and tolerant', () => {
  const rnd = lcg(99);
  const pickOne = <X,>(a: readonly X[]) => a[Math.floor(rnd() * a.length)];
  const messy: B[] = Array.from({ length: 150 }, (_, i) => {
    const device: VoteDevice = rnd() < 0.3 ? 'touch' : 'desktop', list = ids(device);
    const tried = list.filter(() => rnd() < 0.6);
    while (tried.length < 2) { const x = pickOne(list); if (!tried.includes(x)) tried.push(x); }
    return { device, favorite: rnd() < 0.2 ? 'tie' : pickOne(tried), tried, last: pickOne(tried), tag: tag(Math.floor(rnd() * 20)), hour: pickOne([H1, H2, '2026100109']) };
  });
  const pairs = messy.map(pairOf);
  const want = JSON.stringify(aggregate(pairs.flat(), [`T:${D}:${tag(3)}`], min, NOW, true));
  it('gives the same answer for every order of the entries, in either shape', () => {
    const r = lcg(5);
    for (let round = 0; round < 25; round++) {
      const shuffled = [...pairs].sort(() => r() - 0.5);
      expect(JSON.stringify(aggregate(shuffled.flat(), [`T:${D}:${tag(3)}`], min, NOW, true))).toBe(want);
      expect(JSON.stringify(aggregate(Object.fromEntries(shuffled), [`T:${D}:${tag(3)}`], min, NOW, true))).toBe(want);
    }
    expect(want).toContain('"ranked":true');
  });
  it('R9 malformed entries are skipped, never rendered, and change nothing', () => {
    const junk: [string, unknown][] = [['a', 'x'], ['b', ''], ['c', '2026093014d2857a3f0'], ['d', '2026093014d-857a3f'], ['e', '-33%'], ['f', '2026133014d2857a3f'], ['g', '2026093014d0107a3f'], ['h', 5 as unknown], ['i', null]];
    const noisy = aggregate([...pairs.flat(), ...junk.flatMap(([k, v]) => [k, v as string])], [`T:${D}:${tag(3)}`], min, NOW, true);
    expect(JSON.stringify(noisy)).toBe(want);
    const text = JSON.stringify(noisy);
    expect(text).not.toMatch(/:-\d|NaN|Infinity|undefined/);
    expect(JSON.stringify(aggregate([...junk.flatMap(([k, v]) => [k, v as string])], [], OPTS, NOW, true))).toBe(JSON.stringify(aggregate([], [], OPTS, NOW, true)));
  });
  it('never yields a negative or non-finite number, whatever the entries', () => {
    const r = JSON.parse(want) as VoteResults;
    for (const d of ['touch', 'desktop'] as const) for (const c of Object.values(r.families[d].controls ?? {})) {
      for (const x of [c.picked, c.tried]) expect(Number.isFinite(x) && x >= 0).toBe(true);
      expect(c.rate === null || (c.rate >= 0 && c.rate <= 100)).toBe(true);
    }
  });
  it('atk:3 cap and minv change the answer; nothing else in opts can', () => {
    const base = aggregate(pairs.flat(), [], min, NOW, true);
    expect(aggregate(pairs.flat(), [], { cap: 50, minVotes: 10 }, NOW, true)).not.toEqual(base);
    expect(aggregate(pairs.flat(), [], { cap: 5, minVotes: 400 }, NOW, true).families.desktop.ranked).toBe(false);
    const extra = { ...min, unit: 1, block: 1, global: 1, max: 100 } as unknown as typeof min;
    expect(aggregate(pairs.flat(), [], extra, NOW, true)).toEqual(base);
  });
  it('falls back to the default cap and floor for a cap or floor that is not a usable number', () => {
    const base = aggregate(pairs.flat(), [], { cap: 5, minVotes: 30 }, NOW, true);
    for (const cap of [NaN, 0, -1, Infinity]) expect(aggregate(pairs.flat(), [], { cap, minVotes: 30 }, NOW, true), String(cap)).toEqual(base);
    expect(aggregate(pairs.flat(), [], { cap: 5, minVotes: NaN }, NOW, true)).toEqual(aggregate(pairs.flat(), [], { cap: 5, minVotes: MINV_DEFAULT }, NOW, true)); // the default floor is 300
  });
});

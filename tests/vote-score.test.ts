import { describe, expect, it } from 'vitest';
import type { ControlId } from '@/game/controlTypes';
import { LEAD_MIN_GROUPS, LEAD_MIN_POINTS, RANK_SHRINK, pairWeights, rankOrder, round1, roundDown5, shrunkRate } from '@/server/vote/score';

const REG: ControlId[] = ['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush'];
const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('pairWeights: one ballot hands out one win-point and one loss-point whatever k is', () => {
  it('atk:1 a pick totals 1 win and 1 loss for k = 2 to 8 (pair rivals, each 1/(k-1))', () => {
    for (let k = 2; k <= 8; k++) {
      const w = pairWeights(k, false);
      expect(w.pair, `k=${k}`).toBe(k - 1);
      near(w.win, 1 / (k - 1));
      near(w.loss, 1 / (k - 1));
      near(w.win * w.pair, 1);
      near(w.loss * w.pair, 1);
    }
  });
  it('atk:1 a tie totals 1 win and 1 loss for k = 2 to 8 (k(k-1)/2 pairs, both sides of each pair)', () => {
    for (let k = 2; k <= 8; k++) {
      const w = pairWeights(k, true);
      expect(w.pair, `k=${k}`).toBe((k * (k - 1)) / 2);
      near(w.win * w.pair * 2, 1);
      near(w.loss * w.pair * 2, 1);
    }
  });
  it('matches the worked examples of section 5.1', () => {
    // 3 tried, pick A: A gains 2 x 0.5 = 1 win, B and C 0.5 loss each.
    expect(pairWeights(3, false)).toEqual({ win: 0.5, loss: 0.5, pair: 2 });
    // the same ballot claiming all 8 desktop controls: 7 x 1/7 = 1 win, seven rivals 1/7 loss each.
    near(pairWeights(8, false).win, 1 / 7);
    expect(pairWeights(8, false).pair).toBe(7);
    // tie among A, B, C: 3 pairs of 1/3, each control ends with 1/3 win and 1/3 loss (2 pairs x 1/6).
    const t = pairWeights(3, true);
    expect(t.pair).toBe(3);
    near(t.win * 2, 1 / 3);
    near(t.loss * 2, 1 / 3);
  });
  it('a ballot that claims 8 moves no control by more than a ballot that claims 2 would move the favorite', () => {
    const claim2 = pairWeights(2, false), claim8 = pairWeights(8, false);
    near(claim2.win * claim2.pair, claim8.win * claim8.pair);
    expect(claim8.loss).toBeLessThan(claim2.loss);
  });
  it('gives zeros, never NaN or Infinity, for a k that cannot be a ballot', () => {
    for (const k of [0, 1, -3, NaN]) for (const tie of [true, false]) expect(pairWeights(k, tie)).toEqual({ win: 0, loss: 0, pair: 0 });
  });
});

describe('shrunkRate', () => {
  it('is 0 with no comparisons (a control nobody met is last) and pulled toward one half by RANK_SHRINK points', () => {
    expect(shrunkRate(0, 0)).toBe(0);
    near(shrunkRate(5, 0), (5 + RANK_SHRINK / 2) / (5 + RANK_SHRINK));
    near(shrunkRate(0, 10), (RANK_SHRINK / 2) / (10 + RANK_SHRINK));
    near(shrunkRate(12, 12), 0.5);
  });
  it('R1 a perfect short record is pulled well down (5-0 is 0.59, not 1) and needs real volume to reach the top; the lead rule below does the rest', () => {
    expect(shrunkRate(5, 0)).toBeLessThan(0.6);
    expect(shrunkRate(5, 0)).toBeLessThan(shrunkRate(30, 0));
    expect(shrunkRate(30, 0)).toBeLessThan(0.9);
    expect(shrunkRate(50, 0)).toBeGreaterThan(shrunkRate(60, 40));
  });
  it('grows with the evidence at the same raw rate and stays between 0 and 1', () => {
    let prev = 0;
    for (const n of [2, 4, 10, 40, 200, 1000]) { const v = shrunkRate(n, 0); expect(v).toBeGreaterThan(prev); expect(v).toBeLessThan(1); prev = v; }
    for (const [w, l] of [[1e6, 0], [0, 1e6], [0.001, 0.001]]) { const v = shrunkRate(w, l); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});

describe('rankOrder', () => {
  // [wins, losses, groups]: groups is how many network groups gave the control a win-point.
  const rows = (o: Record<string, [number, number, number?]>) => Object.fromEntries(Object.entries(o).map(([k, [wins, losses, groups]]) => [k, { wins, losses, groups: groups ?? 50 }]));
  it('R5 ranks 3-0 below 30-5 (a short record is shrunk, not read as a raw rate)', () => {
    const order = rankOrder(rows({ flow: [3, 0], cursor: [30, 5] }), REG);
    expect(order.indexOf('cursor')).toBeLessThan(order.indexOf('flow'));
    expect(order).toHaveLength(8);
    expect(new Set(order)).toEqual(new Set(REG));
  });
  it('orders by the shrunk rate, best first, and puts controls with no points last in registry order', () => {
    expect(rankOrder(rows({ brush: [40, 10], draw: [30, 20], conduct: [10, 40] }), REG)).toEqual(['brush', 'draw', 'conduct', 'cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys']);
  });
  it('breaks equal rates by more comparison points, then by registry order', () => {
    expect(rankOrder(rows({ brush: [20, 20], draw: [20, 20], flow: [20, 20] }), REG).slice(0, 3)).toEqual(['flow', 'draw', 'brush']);
    expect(rankOrder(rows({ cursor: [0, 4], flow: [0, 9] }), REG).slice(0, 2)).toEqual(['cursor', 'flow']); // 0-4 shrinks to a higher rate than 0-9
    expect(rankOrder(rows({ cursor: [0, 4], flow: [0, 4] }), REG).slice(0, 2)).toEqual(['cursor', 'flow']); // equal in everything: registry order
  });
  it('R1 a control without LEAD_MIN_POINTS comparison points or LEAD_MIN_GROUPS backing groups cannot lead, however clean its record', () => {
    const few = LEAD_MIN_POINTS - 1, fewGroups = LEAD_MIN_GROUPS - 1;
    expect(rankOrder(rows({ conduct: [few, 0], cursor: [30, 30] }), REG)[0]).toBe('cursor');
    expect(rankOrder(rows({ conduct: [400, 0, fewGroups], cursor: [30, 30] }), REG)[0]).toBe('cursor');
    expect(rankOrder(rows({ conduct: [LEAD_MIN_POINTS, 0, LEAD_MIN_GROUPS], cursor: [30, 30] }), REG)[0]).toBe('conduct');
    expect(rankOrder(rows({ conduct: [400, 0, fewGroups], cursor: [1, 60, 1] }), REG).slice(0, 2)).toEqual(['conduct', 'cursor']); // nobody leads: the rate decides
  });
  it('is not disturbed by float noise below 1e-6', () => {
    const noisy = rows({ cursor: [10, 10], flow: [10 + 1e-9, 10 - 1e-9], brush: [10, 10] });
    expect(rankOrder(noisy, REG).slice(0, 3)).toEqual(['cursor', 'flow', 'brush']);
  });
  it('gives every control of the registry exactly once, including ids missing from the rows', () => {
    const order = rankOrder({}, REG);
    expect(order).toEqual(REG);
    expect(rankOrder(rows({ brush: [1, 0] }), REG)[0]).toBe('brush');
  });
  it('does not mutate the registry it is given', () => {
    const reg = [...REG];
    rankOrder(rows({ brush: [9, 1] }), reg);
    expect(reg).toEqual(REG);
  });
});

describe('rounding', () => {
  it('round1 rounds half up to one decimal', () => {
    expect([round1(0), round1(0.04), round1(0.05), round1(1.25), round1(51.34), round1(27.449999), round1(99.95)]).toEqual([0, 0, 0.1, 1.3, 51.3, 27.4, 100]);
  });
  it('round1 is not tricked by float noise', () => {
    expect(round1(0.1 + 0.2)).toBe(0.3);
    expect(round1(1.0499999999)).toBe(1.1); // 1e-6 noise below a half is forgiven
    expect(round1(1.049999)).toBe(1);
  });
  it('roundDown5 rounds down to a multiple of 5', () => {
    expect([roundDown5(0), roundDown5(4.9), roundDown5(5), roundDown5(9.99), roundDown5(30), roundDown5(34.2), roundDown5(1199)]).toEqual([0, 0, 5, 5, 30, 30, 1195]);
  });
  it('roundDown5 forgives the float noise of scaled sums: 7 votes x 5/7 is 5, not 0', () => {
    let s = 0;
    for (let i = 0; i < 7; i++) s += 5 / 7;
    expect(roundDown5(s)).toBe(5);
    expect(roundDown5(29.9999999)).toBe(30);
    expect(roundDown5(29.99)).toBe(25);
  });
});

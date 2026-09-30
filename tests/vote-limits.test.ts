import { describe, expect, it } from 'vitest';
import { BLOCK_LIMIT, CAP_DEFAULT, DEFAULT_LIMITS, GLOBAL_LIMIT, MAX_ENTRIES, MINV_DEFAULT, ROUND_LIMIT, UNIT_LIMIT, limitsFrom, secondsToUtcMidnight, utcDate, utcHour } from '@/server/vote/limits';

describe('limits: defaults and limitsFrom', () => {
  it('pins the defaults of section 3', () => {
    expect([UNIT_LIMIT, BLOCK_LIMIT, GLOBAL_LIMIT, MAX_ENTRIES, CAP_DEFAULT, MINV_DEFAULT, ROUND_LIMIT]).toEqual([8, 60, 1200, 6000, 5, 100, 10]);
    expect(DEFAULT_LIMITS).toEqual({ mode: 'open', unit: 8, block: 60, global: 1200, max: 6000, cap: 5, minv: 100, round: 10 });
  });
  it('gives the defaults for an all-null reply (an empty ctl hash) and for a short array', () => {
    expect(limitsFrom([null, null, null, null, null, null, null, null])).toEqual(DEFAULT_LIMITS);
    expect(limitsFrom([])).toEqual(DEFAULT_LIMITS);
    expect(limitsFrom([null])).toEqual(DEFAULT_LIMITS);
  });
  it('reads every knob from the strings Upstash returns, and from numbers', () => {
    expect(limitsFrom(['open', '4', '10', '300', '12000', '3', '150', '7'])).toEqual({ mode: 'open', unit: 4, block: 10, global: 300, max: 12000, cap: 3, minv: 150, round: 7 });
    expect(limitsFrom([null, 20, 200, 3000, 12000, 40, 100, 25])).toMatchObject({ unit: 20, block: 200, global: 3000, max: 12000, cap: 40, minv: 100, round: 25 });
  });
  it('accepts each clamp edge and ignores a value one step outside it', () => {
    const edge = { unit: [1, 200], block: [1, 2000], global: [1, 20000], max: [100, 20000], cap: [2, 100], minv: [10, 1000], round: [1, 1000] } as const;
    const at = (name: keyof typeof edge, v: number) => { const r: (string | null)[] = Array(8).fill(null); r['unit block global max cap minv round'.split(' ').indexOf(name) + 1] = String(v); return limitsFrom(r)[name]; };
    for (const [name, [lo, hi]] of Object.entries(edge) as [keyof typeof edge, readonly [number, number]][]) {
      expect(at(name, lo), `${name} min`).toBe(lo);
      expect(at(name, hi), `${name} max`).toBe(hi);
      expect(at(name, lo - 1), `${name} below`).toBe(DEFAULT_LIMITS[name]);
      expect(at(name, hi + 1), `${name} above`).toBe(DEFAULT_LIMITS[name]);
    }
  });
  it('ignores non-integers, signs, exponents, spaces, words and huge numbers (the default applies)', () => {
    for (const bad of ['5.5', '-3', '+5', '1e1', ' 5', '5 ', 'five', '', '0x10', '99999999999999999999', 'NaN', 'Infinity', '5,5']) {
      expect(limitsFrom([null, bad, bad, bad, bad, bad, bad, bad]), JSON.stringify(bad)).toEqual(DEFAULT_LIMITS);
    }
    expect(limitsFrom([null, 5.5, NaN, Infinity, -1, {}, [], 2.5])).toEqual(DEFAULT_LIMITS);
  });
  it('a value can never open a gate wider than its clamp', () => {
    const l = limitsFrom([null, '1000000', '1000000', '1000000', '1000000', '1000000', '1000000', '1000000']);
    expect(l).toEqual(DEFAULT_LIMITS);
    expect(limitsFrom([null, '0', '0', '0', '0', '0', '0', '0'])).toEqual(DEFAULT_LIMITS);
  });
  it('fails closed: an unknown mode is closed, only exactly open (or absent) is open', () => {
    for (const mode of ['closed', 'CLOSED', 'Open', 'OPEN', 'open ', 'paused', '', '0', 1, true, {}]) expect(limitsFrom([mode, null, null, null, null, null, null, null]).mode, JSON.stringify(mode)).toBe('closed');
    for (const mode of ['open', null, undefined]) expect(limitsFrom([mode, null, null, null, null, null, null, null]).mode).toBe('open');
  });
  it('fails closed on a reply that is not an array, and still hands back sane numbers', () => {
    for (const reply of [null, undefined, 'OK', 5, {}]) expect(limitsFrom(reply)).toEqual({ ...DEFAULT_LIMITS, mode: 'closed' });
  });
  it('stamps the UTC hour and date, at the day edges', () => {
    expect(utcHour(Date.UTC(2026, 8, 30, 14, 5, 59))).toBe('2026093014');
    expect(utcDate(Date.UTC(2026, 8, 30, 14, 5, 59))).toBe('20260930');
    expect(utcDate(Date.UTC(2026, 8, 30, 23, 59, 59, 999))).toBe('20260930');
    expect(utcDate(Date.UTC(2026, 9, 1, 0, 0, 0))).toBe('20261001');
    expect(utcHour(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe('2026010100');
    expect(utcDate(Date.UTC(2028, 1, 29, 12))).toBe('20280229');
  });
  it('F3 counts the honest seconds to the next UTC midnight, at least 1', () => {
    expect(secondsToUtcMidnight(Date.UTC(2026, 8, 30, 14, 5, 0))).toBe(9 * 3600 + 55 * 60);
    expect(secondsToUtcMidnight(Date.UTC(2026, 8, 30, 0, 0, 0))).toBe(86400);
    expect(secondsToUtcMidnight(Date.UTC(2026, 8, 30, 23, 59, 59, 500))).toBe(1);
    expect(secondsToUtcMidnight(Date.UTC(2026, 11, 31, 23, 0, 0))).toBe(3600); // over a year end
    expect(secondsToUtcMidnight(Date.UTC(2028, 1, 28, 12))).toBe(12 * 3600); // the day after is a leap day, still one midnight away
  });
});

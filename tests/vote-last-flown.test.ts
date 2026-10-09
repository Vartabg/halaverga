import { describe, expect, it } from 'vitest';
import { aggregate, tally } from '@/server/vote/aggregate';
import { LAST_FLOWN_MIN, addOrder, newOrderAcc, orderResult } from '@/server/vote/lastFlown';
import { MINV_DEFAULT } from '@/server/vote/limits';
import { NOW, OPTS, agg, flat, lcg, spread, tag, type B } from './helpers/voteAgg';

// Touch: the starting control is one-finger. A "challenger ballot" tried it and one other control, flown last.
const T = (favorite: B['favorite'], last: B['last'] = 'draw', tried: B['tried'] = ['one-finger', 'draw']): Omit<B, 'tag'> => ({ device: 'touch', favorite, tried, last });
const touch = (r: ReturnType<typeof aggregate>) => r.families.touch;
const run = (bs: B[], opts = OPTS) => aggregate(flat(bs), [], opts, NOW, true);
const many = (n: number, mk: () => Omit<B, 'tag'>, from: number): B[] => spread(n, mk, from);

describe('V1 the order check: the control flown last against the starting control', () => {
  it(`is null below ${LAST_FLOWN_MIN} counted picks and shows from ${LAST_FLOWN_MIN}: last 75%, starting control 25%, equal-liking baseline 50% (two controls tried)`, () => {
    const bs = (last: number, first: number) => [...many(last, () => T('draw'), 0), ...many(first, () => T('one-finger'), 300)];
    expect(touch(run(bs(149, 50))).lastFlown).toBeNull(); // 199 picks
    expect(touch(run(bs(150, 50))).lastFlown).toEqual({ n: 200, last: 75, first: 25, even: 50 });
  });

  it('the baseline is equal liking, not "no order effect": a challenger liked 60 to 40 with no order effect in the data already sits 10 points over it', () => {
    // Every pick here follows liking alone (60% the challenger flown last, 40% the default), so order does nothing by construction.
    const r = touch(run([...many(120, () => T('draw'), 0), ...many(80, () => T('one-finger'), 300)])).lastFlown;
    expect(r).toEqual({ n: 200, last: 60, first: 40, even: 50 });
    // The entry keeps no order, so these ballots are exactly what an equally liked pair with a novelty effect would store: the gap cannot say which.
  });

  it('counts only the picks that carry an order: not Can\'t tell, not a ballot without the starting control, not one that ends on it', () => {
    const base = [...many(150, () => T('draw'), 0), ...many(50, () => T('one-finger'), 300)];
    const noise = [
      ...many(40, () => T('tie'), 600), // Can't tell names no control
      ...many(40, () => T('draw', 'one-finger'), 700), // flown last was the starting control: the order is unknown
      ...many(40, () => T('brush', 'brush', ['draw', 'brush']), 800), // never flew the starting control
      ...many(40, () => T('brush', 'draw', ['draw', 'brush']), 900),
    ];
    expect(touch(run([...base, ...noise])).lastFlown).toEqual(touch(run(base)).lastFlown);
  });

  it('three controls tried: the equal-liking baseline is a third each, and a pick of the third control counts for neither side', () => {
    const three: B['tried'] = ['one-finger', 'draw', 'brush'];
    const bs = [...many(70, () => T('brush', 'brush', three), 0), ...many(70, () => T('one-finger', 'brush', three), 100), ...many(60, () => T('draw', 'brush', three), 200)];
    expect(touch(run(bs)).lastFlown).toEqual({ n: 200, last: 35, first: 35, even: 33 });
  });

  it('a mix of two and three tried gives the weighted equal-liking baseline', () => {
    const three: B['tried'] = ['one-finger', 'draw', 'brush'];
    const bs = [...many(100, () => T('draw'), 0), ...many(100, () => T('one-finger', 'brush', three), 100)]; // half 1/2, half 1/3: 41.7%
    expect(touch(run(bs)).lastFlown).toMatchObject({ n: 200, last: 50, first: 50, even: 42 });
  });

  it('desktop reads Cursor as the starting control', () => {
    const D = (favorite: B['favorite']): Omit<B, 'tag'> => ({ device: 'desktop', favorite, tried: ['cursor', 'flow'], last: 'flow' });
    const bs = [...many(120, () => D('flow'), 0), ...many(80, () => D('cursor'), 300)];
    expect(run(bs).families.desktop.lastFlown).toEqual({ n: 200, last: 60, first: 40, even: 50 });
    expect(run(bs).families.touch.lastFlown).toBeNull();
  });

  it('is published like the rest: n down to a multiple of 5, shares in whole percent, and exactly four keys', () => {
    const r = run([...many(100, () => T('draw'), 0), ...many(107, () => T('one-finger'), 300)]); // 207 picks
    expect(touch(r).lastFlown).toEqual({ n: 205, last: 48, first: 52, even: 50 });
    expect(Object.keys(JSON.parse(JSON.stringify(touch(r).lastFlown)))).toEqual(['n', 'last', 'first', 'even']);
    expect(tally(flat(many(207, () => T('draw'), 0)), [], OPTS, NOW, true).families.touch.lastFlown!.n).toBe(207); // the exact tally keeps the whole number; only aggregate cuts it
  });

  it('stays null while the family is unranked, even with enough picks: below the floor nothing but the count leaves the server', () => {
    const bs = [...many(150, () => T('draw'), 0), ...many(100, () => T('one-finger'), 300)]; // 250 votes
    const low = run(bs, { cap: 5, minVotes: 300 }), high = run(bs, { cap: 5, minVotes: 250 });
    expect(touch(low)).toEqual({ votes: 250, ranked: false, tie: null, order: null, controls: null, lastFlown: null });
    expect(touch(high).ranked).toBe(true);
    expect(touch(high).lastFlown).toMatchObject({ n: 250, last: 60, first: 40 });
  });

  it('weighs a ballot as the tally does: one network that names the starting control 100 times counts for the favorite cap, not 100', () => {
    const honest = many(220, () => T('draw'), 0);
    const stuffed = many(100, () => T('one-finger'), 400).map((b) => ({ ...b, tag: 'a3f' }));
    const f = touch(run([...honest, ...stuffed])).lastFlown!;
    expect(f.n).toBe(220); // 222 counted, down to 5
    expect([f.last, f.first]).toEqual([99, 1]); // 220/222 and 2/222: the stuffed group counts for 2
  });

  it('no score reads it: whichever control each ballot says it flew last, the ranking, the rates and the counts are the same', () => {
    const rnd = lcg(11), others = ['twin-stick', 'draw', 'conduct', 'brush'] as const;
    const bs: B[] = spread(260, (i) => {
      const x = others[Math.floor(rnd() * 4)], tried: B['tried'] = ['one-finger', x];
      return { device: 'touch', favorite: i % 7 === 0 ? 'tie' : i % 2 ? x : 'one-finger', tried, last: x };
    });
    const flipped = bs.map((b) => ({ ...b, last: 'one-finger' as const })); // every ballot now says it ended on the starting control
    const a = agg(bs, [], OPTS).families.touch, b = agg(flipped, [], OPTS).families.touch;
    expect(a.lastFlown).not.toBeNull();
    expect(b.lastFlown).toBeNull(); // the order check itself does move with `last`
    expect({ ...a, lastFlown: null }).toEqual({ ...b, lastFlown: null }); // and nothing else does: votes, tie, order, every pick, try, win, loss and rate
  });

  it('addOrder ignores a ballot with no pick and one that ends on the starting control, and orderResult guards an empty tally', () => {
    const acc = newOrderAcc();
    addOrder(acc, { hour: '2026093014', device: 'touch', favorite: null, tried: ['one-finger', 'draw'], last: 'draw', tag: 'a3f' }, 1);
    addOrder(acc, { hour: '2026093014', device: 'touch', favorite: 'draw', tried: ['one-finger', 'draw'], last: 'one-finger', tag: 'a3f' }, 1);
    expect(acc).toEqual(newOrderAcc());
    expect(orderResult(acc)).toBeNull();
  });

  it('the floor is a code constant of 200 and the ranking floor default is 300', () => {
    expect([LAST_FLOWN_MIN, MINV_DEFAULT]).toEqual([200, 300]);
    expect(tag(0)).toBe('100'); // fixture sanity: tags are 3 hex characters
  });
});

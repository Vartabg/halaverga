import { describe, expect, it } from 'vitest';
import type { ControlId } from '@/game/controlTypes';
import { VOTE_ROUND } from '@/lib/vote/ballot';
import { aggregate, hashToPairs, parseVoid, tally, type ExactResults } from '@/server/vote/aggregate';
import { D, FILL, H1, H2, NOW, OPTS, agg, ctl, desk, ids, min, pairOf, spread, tag, type B } from './helpers/voteAgg';

describe('hashToPairs and parseVoid', () => {
  it('pairs the flat HGETALL array, tolerates the object form, and drops the rest', () => {
    expect(hashToPairs(['n1', 'e1', 'n2', 'e2'])).toEqual([['n1', 'e1'], ['n2', 'e2']]);
    expect(hashToPairs(['n1', 'e1', 'dangling'])).toEqual([['n1', 'e1']]);
    expect(hashToPairs({ n1: 'e1', n2: 'e2' })).toEqual([['n1', 'e1'], ['n2', 'e2']]);
    expect(hashToPairs({ n1: 'e1', n2: 5, n3: null })).toEqual([['n1', 'e1']]);
    expect(hashToPairs(['n1', 5, 6, 'e'])).toEqual([]);
    for (const junk of [null, undefined, 'OK', 7, []]) expect(hashToPairs(junk)).toEqual([]);
  });
  it('reads H, T:<D>:<g> and T:<H>:<g>, and ignores malformed members', () => {
    const v = parseVoid(['2026093014', 'T:20260930:a3f', 'T:2026093014:b20']);
    expect([...v.hours]).toEqual(['2026093014']);
    expect([...v.groups].sort()).toEqual(['2026093014:b20', '20260930:a3f']);
    const junk = ['x', '', 'T:', 'T:20260930', 'T:20260930:zzz', 'T:20260930:A3F', 'T:20260930:a3', 'T:20260930:a3ff', 'T:2026093:a3f', 'T:202609301:a3f', 'T:202609301415:a3f', 't:20260930:a3f',
      '202609301', '20260930141', '2026093014 ', ' 2026093014', '2026-09-30', 'T:20260930:a3f ', 5, null, {}, ['2026093014']];
    const v2 = parseVoid(junk);
    expect(v2.hours.size + v2.groups.size).toBe(0);
    for (const bad of [null, undefined, 'x', 3, {}]) expect(parseVoid(bad)).toEqual({ hours: new Set(), groups: new Set() });
  });
});

describe('aggregate: the shape of the answer', () => {
  it('answers an empty hash with two unranked families, nulls and zero votes', () => {
    const r = aggregate([], [], OPTS, NOW, true);
    expect(r).toEqual({ v: 3, round: VOTE_ROUND, asOf: '2026-09-30T14:05:12Z', open: true, families: {
      touch: { votes: 0, ranked: false, tie: null, order: null, controls: null, lastFlown: null },
      desktop: { votes: 0, ranked: false, tie: null, order: null, controls: null, lastFlown: null } } });
    expect(aggregate(undefined, undefined, OPTS, NOW, false).open).toBe(false);
  });
  it('asOf is the read time in UTC without milliseconds', () => {
    expect(aggregate([], [], OPTS, Date.UTC(2026, 0, 2, 3, 4, 5, 678), true).asOf).toBe('2026-01-02T03:04:05Z');
  });
  it('R2 below the floor the JSON has controls, order and tie null; ranked has counts and asOf', () => {
    const below = agg(spread(11, () => FILL), [], OPTS);
    expect(JSON.stringify(below)).not.toMatch(/heldHours|stale|note|build/);
    expect(desk(below)).toMatchObject({ ranked: false, controls: null, order: null, tie: null });
    const up = agg(spread(30, () => FILL));
    expect(desk(up)).toMatchObject({ votes: 30, ranked: true });
    expect(desk(up).order).toHaveLength(8);
    expect(Object.keys(desk(up).controls!)).toEqual(ids('desktop')); // a row for every control, zeros included, in registry order
    expect(ctl(up, 'brush')).toEqual({ picked: 0, tried: 0, wins: 0, losses: 0, rate: null });
    expect(ctl(up, 'flow')).toEqual({ picked: 30, tried: 30, wins: 30, losses: 0, rate: 100 });
    expect(ctl(up, 'captured')).toEqual({ picked: 0, tried: 30, wins: 0, losses: 30, rate: 0 });
  });
  it('lists the touch family with its own five controls, separate from desktop', () => {
    const r = agg(spread(30, i => ({ device: 'touch', favorite: 'brush', tried: ['draw', 'brush'], last: 'draw' })));
    expect(Object.keys(r.families.touch.controls!)).toEqual(ids('touch'));
    expect(r.families.touch).toMatchObject({ votes: 30, ranked: true });
    expect(r.families.desktop).toMatchObject({ votes: 0, ranked: false });
  });
  it('the exact tally rounds votes down to a multiple of 5, picked/tried/tie to integers and wins/losses to one decimal', () => {
    for (const n of [1, 4, 5, 6, 9, 29, 31, 34, 39]) expect(desk(agg(spread(n, () => FILL))).votes, `n=${n}`).toBe(Math.floor(n / 5) * 5);
    const r = agg([...spread(13, () => ({ favorite: 'tie', tried: ['cursor', 'flow', 'brush'] })), ...spread(20, () => ({ favorite: 'flow', tried: ['cursor', 'flow', 'brush'] }), 20)], [], min);
    const c = ctl(r, 'brush');
    expect(Number.isInteger(c.picked) && Number.isInteger(c.tried)).toBe(true);
    expect(Number.isInteger(desk(r).tie)).toBe(true);
    for (const id of ids('desktop')) for (const x of [ctl(r, id).wins, ctl(r, id).losses]) expect(Math.round(x * 10) / 10).toBe(x);
    expect(desk(r).tie).toBe(13);
  });
  it('R2 aggregate publishes picked, tried and tie down to a multiple of 5, drops wins and losses, and keeps rate, order and votes', () => {
    const bs = [...spread(13, () => ({ favorite: 'tie', tried: ['cursor', 'flow', 'brush'] })), ...spread(22, () => ({ favorite: 'flow', tried: ['cursor', 'flow', 'brush'] }), 20)];
    const exact = agg(bs, [], min), pub = aggregate(bs.flatMap(pairOf), [], min, NOW, true);
    expect(desk(exact).tie).toBe(13);
    expect(pub.families.desktop.tie).toBe(10);
    expect(pub.families.desktop.votes).toBe(desk(exact).votes);
    expect(pub.families.desktop.order).toEqual(desk(exact).order);
    for (const id of ids('desktop')) {
      const p = pub.families.desktop.controls![id], e = ctl(exact, id);
      expect(Object.keys(p).sort()).toEqual(['picked', 'rate', 'tried']);
      expect([p.picked, p.tried, p.rate]).toEqual([Math.floor(e.picked / 5) * 5, Math.floor(e.tried / 5) * 5, e.rate]);
    }
    expect(pub.families.desktop.controls!.flow.picked).toBe(20); // 22 picked, published 20
  });
  it('open is passed through', () => expect(agg([], [], OPTS, false).open).toBe(false));
});

describe('F5 void an hour, a group for a day, a group for an hour; SREM restores', () => {
  // 24 honest groups (12 in each hour) and one group a00 with 40 brush ballots in hour 1 and 10 cursor ballots in hour 2, all one day.
  const honest = spread(24, i => ({ favorite: 'flow', tried: ['flow', 'captured'], hour: i < 12 ? H1 : H2 }));
  const stuffed = [...Array.from({ length: 40 }, (): B => ({ favorite: 'brush', tried: ['cursor', 'brush'], tag: 'a00', hour: H1 })),
    ...Array.from({ length: 10 }, (): B => ({ favorite: 'cursor', tried: ['cursor', 'brush'], tag: 'a00', hour: H2 }))];
  const rows = [...honest, ...stuffed].map(pairOf);
  const run = (voids: unknown) => tally(rows.flat(), voids, { ...min, favCap: min.cap }, NOW, true); // the group cap on its own (the favorite cap is R1's)
  const pk = (r: ExactResults) => [ctl(r, 'flow').picked, ctl(r, 'brush').picked, ctl(r, 'cursor').picked];
  const base = run([]);

  it('with nothing voided the group counts for cap 5 (n=50, scale 0.1)', () => {
    expect(pk(base)).toEqual([24, 4, 1]);
    expect(desk(base).votes).toBe(25);
  });
  it('T:<D>:<g> removes the whole group for that day and only that group', () => {
    const r = run([`T:${D}:a00`]);
    expect(pk(r)).toEqual([24, 0, 0]);
    expect(desk(r).votes).toBe(20);
  });
  it('T:<H>:<g> removes that group for that hour only, and the rest rescales', () => {
    expect(pk(run([`T:${H2}:a00`]))).toEqual([24, 5, 0]); // 40 left, scale 5/40
    expect(pk(run([`T:${H1}:a00`]))).toEqual([24, 0, 5]); // 10 left, scale 5/10
    expect(pk(run([`T:${H1}:b00`]))).toEqual(pk(base)); // another group's tag: nothing
    expect(pk(run([`T:2026093016:a00`]))).toEqual(pk(base)); // an hour with no entries: nothing
  });
  it('an hour member removes every entry of that hour, honest ones too', () => {
    const r1 = run([H1]);
    expect(pk(r1)).toEqual([12, 0, 5]);
    expect(desk(r1).votes).toBe(15);
    expect(pk(run([H2]))).toEqual([12, 5, 0]);
    expect(desk(run([H1, H2])).ranked).toBe(false);
    expect(desk(run([H1, H2])).votes).toBe(0);
  });
  it('several members combine', () => {
    expect(pk(run([H2, `T:${D}:a00`]))).toEqual([12, 0, 0]);
  });
  it('SREM restores the exact result', () => {
    expect(run([`T:${D}:a00`, H1])).not.toEqual(base);
    expect(run([])).toEqual(base);
    expect(run(['T:20261001:a00'])).toEqual(base); // a void for another day changes nothing
  });
  it('malformed void members are ignored', () => {
    expect(run(['x', 'T:', 'T:20260930:zzz', 'T:2026093:a00', '202609301', 'T:20260930:A00', 't:20260930:a00', '2026093014 ', 5, null, {}])).toEqual(base);
    expect(run('not a list')).toEqual(base);
    expect(run(undefined)).toEqual(base);
  });
});

describe('atk:6 ranked needs the floor and 12 groups', () => {
  const votes30 = (groups: number): B[] => Array.from({ length: 30 }, (_, i) => ({ ...FILL, tag: tag(i % groups) })) as B[];
  it('30 votes from 11 groups is not ranked, from 12 it is', () => {
    expect(desk(agg(votes30(11), [], { cap: 100, minVotes: 30 }))).toMatchObject({ votes: 30, ranked: false, controls: null, order: null, tie: null });
    expect(desk(agg(votes30(12), [], { cap: 100, minVotes: 30 })).ranked).toBe(true);
    expect(desk(agg(votes30(30), [], OPTS)).ranked).toBe(true);
  });
  it('29 counted votes from 30 groups is not ranked, 30 is', () => {
    expect(desk(agg(spread(29, () => FILL))).ranked).toBe(false);
    expect(desk(agg(spread(30, () => FILL))).ranked).toBe(true);
  });
  it('the floor counts votes after the cap: 40 entries in 4 groups of 10 count for 20', () => {
    const r = agg(Array.from({ length: 40 }, (_, i) => ({ ...FILL, tag: tag(i % 4) })) as B[]);
    expect(desk(r)).toMatchObject({ votes: 20, ranked: false });
  });
  it('minv raises the floor', () => {
    expect(desk(agg(spread(30, () => FILL), [], { cap: 5, minVotes: 100 })).ranked).toBe(false);
    expect(desk(agg(spread(30, () => FILL), [], { cap: 5, minVotes: 30 })).ranked).toBe(true);
    expect(desk(agg(spread(30, () => FILL), [], { cap: 5, minVotes: 10 })).ranked).toBe(true);
    expect(desk(agg(spread(11, () => FILL), [], { cap: 5, minVotes: 10 })).ranked).toBe(false); // 11 groups: the group rule holds at any floor
  });
  it('a family that is ranked does not rank the other', () => {
    const r = agg([...spread(30, () => FILL), ...spread(3, () => ({ device: 'touch' as const, favorite: 'brush' as const, tried: ['draw', 'brush'] as ControlId[] }), 50)]);
    expect([desk(r).ranked, r.families.touch.ranked]).toEqual([true, false]);
  });
  it('counts groups and votes after the void filter: a voided group no longer counts toward the 12 or the floor', () => {
    const bs = spread(12, () => FILL);
    expect(desk(agg(bs, [], min)).ranked).toBe(true);
    expect(desk(agg(bs, [`T:${D}:${tag(0)}`], min))).toMatchObject({ votes: 10, ranked: false }); // 11 groups left, 11 votes
    expect(desk(agg(bs, [`T:${D}:${tag(0)}`], { cap: 5, minVotes: 12 }))).toMatchObject({ ranked: false });
    const more = [...bs, ...spread(20, () => FILL, 40)]; // 32 votes, 32 groups
    expect(desk(agg(more)).ranked).toBe(true);
    expect(desk(agg(more, [`T:${D}:${tag(40)}`, `T:${D}:${tag(41)}`, `T:${D}:${tag(42)}`])).ranked).toBe(false); // 29 votes left, under the floor of 30
  });
});

describe('R5 ranking order is the shrunk rate (lead rule first), then volume, then registry', () => {
  it('ranks 3 wins and 0 losses below 30 wins and 5 losses', () => {
    const bs = [...spread(3, () => ({ favorite: 'flow' as const, tried: ['flow', 'captured'] as ControlId[] })), ...spread(30, () => ({ favorite: 'cursor' as const, tried: ['cursor', 'brush'] as ControlId[] }), 10),
      ...spread(5, () => ({ favorite: 'brush' as const, tried: ['cursor', 'brush'] as ControlId[] }), 50)];
    const r = agg(bs, [], min);
    expect(ctl(r, 'flow').rate).toBe(100);
    expect(ctl(r, 'cursor').rate).toBe(86);
    const order = desk(r).order!;
    expect(order.indexOf('cursor')).toBeLessThan(order.indexOf('flow'));
    expect(order).toHaveLength(8);
  });
  it('puts the best cautious estimate first and the controls nobody met after the rest', () => {
    const r = agg(spread(40, i => ({ favorite: i < 30 ? 'draw' : 'conduct', tried: ['draw', 'conduct'] })), [], min);
    expect(desk(r).order!.slice(0, 2)).toEqual(['draw', 'conduct']);
    expect(desk(r).order!.slice(2)).toEqual(['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'brush']);
  });
});

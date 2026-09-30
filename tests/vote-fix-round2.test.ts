import { afterEach, describe, expect, it, vi } from 'vitest';
import { controlsFor, type ControlId } from '@/game/controlTypes';
import { LEAD_MIN_GROUPS, groupFavCap, leadGroups } from '@/server/vote/score';
import type { Command, VoteStore } from '@/server/vote/store';
import { NS, SALT, T0, VOTES, blockIp, fire, setup, vote, type Setup } from './helpers/voteBody';
import { aggR, fillers, lcg, min, tag, type B } from './helpers/voteAgg';
import { voteKeys } from '@/server/vote/netkeys';

// Regressions for fix round 2 (F2, C1, R1 again, on the tree after round 1): each name carries its finding id and fails on the round-1 code.
afterEach(() => vi.restoreAllMocks());
const DAY = 86_400_000;
const stored = (s: Setup) => Object.keys(s.redis.hash(VOTES)).length;

/** A store whose every exec waits until the test lets it through, so the order of round trips is exact, not a matter of timing. */
function gated(s: Setup) {
  const pending: { cmds: Command[]; done: boolean; ok: () => void; fail: () => void }[] = [];
  s.deps.store = {
    exec: (cmds, o) => new Promise((resolve, reject) => {
      const e = { cmds, done: false, ok: () => { e.done = true; resolve(s.redis.exec(cmds, o)); }, fail: () => { e.done = true; reject(new Error('down')); } };
      pending.push(e);
    }),
  } satisfies VoteStore;
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));
  /** Let every waiting and later store call through until `p` has answered. */
  const pump = async <T,>(p: Promise<T>): Promise<T> => {
    let settled = false;
    void p.then(() => { settled = true; }, () => { settled = true; });
    while (!settled) { await flush(); for (const e of pending) if (!e.done) e.ok(); }
    return p;
  };
  return { pending, flush, pump };
}
const burst = (s: Setup, n: number, from = 100) => Promise.all(Array.from({ length: n }, (_, i) => vote(s, blockIp(from + i))));

describe('F2 an IPv6 attacker cannot lock a /48 for 30 days with 10 requests', () => {
  it('F2 10 votes from 10 different /64s of one /48 leave every other /64 of that /48 able to vote (the round counter is per /64)', async () => {
    const s = setup();
    const out = await fire(s, 10, (i) => `2001:db8:a:${(0x100 + i).toString(16)}::1`);
    expect(out.every((o) => o.status === 200)).toBe(true);
    for (const ip of ['2001:db8:a:1::9', '2001:db8:a:ffff::9', '2001:db8:a:1234::7']) expect((await vote(s, ip)).status, ip).toBe(200);
    expect(stored(s)).toBe(13);
    s.tick(20 * DAY); // and still, weeks later: nothing of the attacker's 10 is left standing in the neighbours' way
    expect((await vote(s, '2001:db8:a:4321::5')).status).toBe(200);
  });

  it('F2 the round key of two /64s in one /48 differs, of two interface ids in one /64 is the same', () => {
    const k = (ip: string) => voteKeys(ip, SALT, T0);
    expect(k('2001:db8:a:1::1').round).not.toBe(k('2001:db8:a:2::1').round);
    expect(k('2001:db8:a:1::1').round).toBe(k('2001:db8:a:1:dead:beef:0:1').round);
    expect(k('2001:db8:a:1::1').block).toBe(k('2001:db8:a:2::1').block); // the /48 is still one block for the day
  });

  it('F2 what stays: 60 requests from /64s of one /48 fill that /48 for the rest of the UTC day only, and the next day it votes again', async () => {
    const s = setup();
    await fire(s, 60, (i) => `2001:db8:b:${(0x100 + i).toString(16)}::1`);
    expect((await vote(s, '2001:db8:b:ffff::9')).status).toBe(429);
    expect((await vote(s, blockIp(3))).status).toBe(200); // another network is untouched
    s.tick(DAY);
    expect((await vote(s, '2001:db8:b:ffff::9')).status).toBe(200);
  });
});

describe('C1 the probe of an expired latch ends with the whole decision, not with gate A', () => {
  it('C1 global limit: while the probe waits on gate B, 300 votes that arrive keep the 429 and touch the store not at all', async () => {
    const s = setup({}, { global: 1 });
    await vote(s);
    await vote(s, blockIp(1)); // gate B says over: the instance latches for 60 s
    s.tick(60_001);
    const g = gated(s), before = s.redis.commands;
    const probe = vote(s, blockIp(2));
    await g.flush();
    expect(g.pending).toHaveLength(1); // the probe's gate A
    g.pending[0].ok();
    await g.flush();
    expect(g.pending).toHaveLength(2); // gate B is in flight: this is where the old code had already closed the latch
    const out = burst(s, 300);
    await g.flush();
    expect(g.pending).toHaveLength(2); // nobody else reached the store
    g.pending[1].ok();
    expect((await probe).status).toBe(429);
    expect((await out).every((r) => r.status === 429)).toBe(true);
    expect(s.redis.commands - before).toBe(5 + 6);
    expect(g.pending).toHaveLength(2);
    const later = await vote(s, blockIp(999)); // the probe re-latched: the instance answers from memory again
    expect([later.status, g.pending.length]).toEqual([429, 2]);
  });

  it('C1 a probe that finds the store healthy closes the latch only when its vote is decided, and then other votes go through', async () => {
    const s = setup({}, { mode: 'closed' });
    await vote(s);
    s.redis.admin(['HDEL', `${NS}:ctl`, 'mode']);
    s.tick(30_001);
    const g = gated(s);
    const probe = vote(s, blockIp(1));
    await g.flush();
    g.pending[0].ok();
    await g.flush(); // gate A answered: open, a new ballot, gate B in flight
    expect(g.pending).toHaveLength(2);
    const held = await burst(s, 5);
    expect(held.map((r) => r.status)).toEqual([503, 503, 503, 503, 503]);
    expect(g.pending).toHaveLength(2);
    g.pending[1].ok();
    expect((await g.pump(probe)).status).toBe(200); // gate B, the write
    const calls = g.pending.length;
    expect((await g.pump(vote(s, blockIp(2)))).status).toBe(200); // the latch is closed now: this one reached the store
    expect(g.pending.length).toBeGreaterThan(calls);
  });

  it('C1 a request that was already in flight before the latch expired cannot close the probe when it finishes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup();
    const g = gated(s);
    const early = vote(s, blockIp(1)); // no latch yet: an ordinary request, its gate A waits in the store
    await g.flush();
    const failing = vote(s, blockIp(2));
    await g.flush();
    g.pending[1].fail(); // another request meets a store error: 502 latch for 5 s
    expect((await failing).status).toBe(502);
    s.tick(5000); // the latch has run out
    const probe = vote(s, blockIp(3)); // claims it: the one probe, its gate A waits in the store
    await g.flush();
    expect(g.pending).toHaveLength(3);
    g.pending[0].ok(); // the early request goes on: gate B, then the write
    await g.flush();
    g.pending[3].ok();
    await g.flush();
    g.pending[4].ok();
    expect((await early).status).toBe(200);
    const held = await burst(s, 20);
    expect(held.every((r) => r.status === 502)).toBe(true); // the probe is still out: the early request did not settle it
    expect(g.pending).toHaveLength(5);
    expect((await g.pump(probe)).status).toBe(200);
  });
});

describe('R1 groups needed to take first place grow with the honest poll', () => {
  const DESK = controlsFor('desktop').map((c) => c.id) as ControlId[];
  const W: Record<string, number> = { cursor: 3, flow: 3, 'one-finger-keys': 2, captured: 1, 'mouse-keys': 2, draw: 1, conduct: 1, brush: 2 };
  const honest = (H: number, groups: number, seed = 9): B[] => {
    const rnd = lcg(seed), ri = (n: number) => Math.floor(rnd() * n), out: B[] = [];
    for (let i = 0; i < H; i++) {
      const k = 2 + ri(3), tried = [...DESK].sort(() => rnd() - 0.5).slice(0, k), tot = tried.reduce((a, x) => a + W[x], 0);
      let x = rnd() * tot, favorite = tried[0];
      for (const c of tried) { x -= W[c]; if (x <= 0) { favorite = c; break; } }
      out.push({ favorite, tried, tag: tag(ri(groups)) });
    }
    return out;
  };
  // Each attacker group is a fresh network sending 5 ballots that name the weakest honest control and claim all 8 tried.
  const attack = (g: number, target: ControlId): B[] => Array.from({ length: g * 5 }, (_, i) => ({ favorite: target, tried: DESK, tag: (0xa00 + Math.floor(i / 5)).toString(16) }));
  const need = (H: number) => {
    const base = honest(H, Math.round(H * 0.8)), f = aggR(base).families.desktop, target = f.order![f.order!.length - 1];
    for (let g = 1; g <= 400; g++) if (aggR([...base, ...attack(g, target)]).families.desktop.order![0] === target) return g;
    return Infinity;
  };

  it('R1 a block whose ballots all name one control counts for 2 of its 5 (the favorite cap), a mixed block still counts for all 5', () => {
    const one = (favorite: ControlId): B => ({ favorite, tried: ['cursor', 'draw', 'brush'], tag: 'a00' });
    const unanimous = aggR([...fillers(), ...Array.from({ length: 5 }, () => one('brush'))], [], min).families.desktop.controls!;
    expect(unanimous.brush.picked).toBe(2);
    const mixed = aggR([...fillers(), one('brush'), one('brush'), one('cursor'), one('cursor'), one('draw')], [], min).families.desktop.controls!;
    expect([mixed.brush.picked, mixed.cursor.picked, mixed.draw.picked]).toEqual([2, 2, 1]);
    const ties = aggR([...fillers(), ...Array.from({ length: 5 }, (): B => ({ favorite: 'tie', tried: ['cursor', 'brush'], tag: 'a00' }))], [], min).families.desktop;
    expect(ties.tie).toBe(5); // a tie names no favorite: only the group cap applies
  });

  it('R1 the favorite cap is two fifths of the group cap, at least 1: cap 5 gives 2, cap 3 gives 2, cap 2 gives 1, cap 100 gives 40', () => {
    expect([2, 3, 5, 10, 100].map(groupFavCap)).toEqual([1, 2, 2, 4, 40]);
    const one = (): B => ({ favorite: 'brush', tried: ['cursor', 'brush'], tag: 'a00' });
    const at = (cap: number) => aggR([...fillers(), ...Array.from({ length: 30 }, one)], [], { cap, minVotes: 10 }).families.desktop.controls!.brush.picked;
    expect([at(2), at(5), at(10), at(100)]).toEqual([1, 2, 4, 30]); // exact tally: 30 ballots of one group, each weighing min(cap / 30, favorite cap / 30)
  });

  it(`R1 one fresh block never leads; a control backed by only a few groups cannot lead a large honest poll (the lead rule needs a tenth of the groups, not just ${LEAD_MIN_GROUPS})`, () => {
    expect([leadGroups(0), leadGroups(60), leadGroups(61), leadGroups(600)]).toEqual([LEAD_MIN_GROUPS, LEAD_MIN_GROUPS, 7, 60]);
    // 600 honest groups of one ballot each; no honest ballot ever tried 'conduct'. 20 fresh blocks name it, 5 ballots each.
    const rnd = lcg(3), rest = DESK.filter((c) => c !== 'conduct');
    const base: B[] = Array.from({ length: 600 }, (_, i) => {
      const a = rest[Math.floor(rnd() * rest.length)], b = rest[(rest.indexOf(a) + 1 + Math.floor(rnd() * (rest.length - 1))) % rest.length];
      return { favorite: rnd() < 0.5 ? a : b, tried: [a, b], tag: tag(i) };
    });
    const pair = (g: number): B[] => Array.from({ length: g * 5 }, (_, i) => ({ favorite: 'conduct' as const, tried: ['conduct', 'draw'] as ControlId[], tag: (0xa00 + Math.floor(i / 5)).toString(16) }));
    expect(aggR([...base, ...pair(20)]).families.desktop.order![0]).not.toBe('conduct'); // 40 points from 20 groups: it had the points and 3x the groups the fixed rule asked
    expect(aggR([...base, ...pair(100)]).families.desktop.order![0]).toBe('conduct'); // a tenth of all groups: now it may lead
  });

  it('R1 groups an attacker needs to take first place with the weakest honest control: at least 20 at 200 honest ballots and 30 at 500 (the round-1 rules needed 11 and 18)', () => {
    expect(need(200)).toBeGreaterThanOrEqual(20);
    expect(need(500)).toBeGreaterThanOrEqual(30);
  });

  it('R1 the honest first place does not change because of the caps: 500 honest ballots, first place is the control honest voters like most', async () => {
    const base = honest(500, 400);
    const f = aggR(base).families.desktop;
    expect(['cursor', 'flow']).toContain(f.order![0]); // weights 3 and 3 in the generator
    expect(f.ranked).toBe(true);
  });
});

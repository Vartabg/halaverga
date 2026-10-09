import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleVote } from '@/server/vote/handlers';
import { MemoLimit } from '@/server/vote/memo';
import { voteKeys } from '@/server/vote/netkeys';
import { readResults } from '@/server/vote/results';
import { D, NS, SALT, T0, VOTES, blockIp, fire, setup, shape, vote, voteBody, voteReq } from './helpers/voteBody';

// Regressions for fix round 1, part 1 (review findings F1 F2 F3; C1 R1 R3 CODE-1 V1 V2 V3 are in vote-fix-round1b.test.ts, R2 in
// vote-results and vote-pages). Each test name carries its finding id; each fails on the code as it was before the fix.
afterEach(() => vi.restoreAllMocks());
const stored = (s: ReturnType<typeof setup>) => Object.keys(s.redis.hash(VOTES)).length;
const DAY = 86_400_000;

describe('F1 one host cannot stuff the ranking across days or unlock it alone', () => {
  it('F1 the round key is the same on every day, follows the network of the unit (an IPv4 address, an IPv6 /64), and differs from the day keys', () => {
    const [a, b, c] = [T0, T0 + DAY, T0 + 30 * DAY].map((t) => voteKeys('203.0.113.9', SALT, t));
    expect([a.round === b.round, b.round === c.round, a.unit === b.unit, a.block === b.block, a.tag === b.tag]).toEqual([true, true, false, false, false]);
    expect(a.round).toMatch(/^[0-9a-f]{6}$/);
    expect(a.round).not.toBe(voteKeys('203.0.113.10', SALT, T0).round); // IPv4: the address itself
    expect(voteKeys('2001:db8:abcd:1::1', SALT, T0).round).toBe(voteKeys('2001:db8:abcd:1:aaaa:bbbb:cccc:dddd', SALT, T0 + DAY).round); // IPv6: the /64, whatever the interface id
    expect(voteKeys('2001:db8:abcd:1::1', SALT, T0).round).not.toBe(voteKeys('2001:db8:abcd:2::1', SALT, T0).round); // F2: not the /48
    expect(a.round).not.toBe(voteKeys('203.0.113.9', `${SALT}x`, T0).round); // keyed: a different salt is a different key
  });

  it('F1 one address sending 8 ballots a day for 20 days gets 10 stored in all (the round limit), and the poll is not ranked by it', async () => {
    const s = setup(), tried = ['draw', 'conduct'];
    for (let day = 0; day < 20; day++) {
      await fire(s, 8, () => '203.0.113.9', () => ({ device: 'touch', favorite: 'conduct', tried, last: 'draw' }));
      s.tick(DAY);
    }
    expect(stored(s)).toBe(10);
    const r = await readResults(s.redis, NS, 'r3', s.at());
    expect(r.families.touch).toMatchObject({ ranked: false, controls: null, order: null });
  });

  it('F1 the same holds for an IPv6 host on one /64 that changes its interface id every day', async () => {
    const s = setup();
    for (let day = 0; day < 12; day++) {
      await fire(s, 3, (i) => `2001:db8:abcd:1:${(day * 3 + i + 1).toString(16)}::1`);
      s.tick(DAY);
    }
    expect(stored(s)).toBe(10);
  });

  it('F1 the round limit is a knob, and a 429 for it has no Retry-After (a new day does not lift it)', async () => {
    const s = setup({}, { round: 3 });
    const out = await Promise.all([1, 2, 3, 4].map(() => vote(s, '203.0.113.9')));
    expect(out.map((r) => r.status)).toEqual([200, 200, 200, 429]);
    expect(out[3].headers.get('retry-after')).toBeNull();
    s.tick(DAY);
    const next = await vote(s, '203.0.113.9');
    expect([next.status, next.headers.get('retry-after')]).toEqual([429, null]);
    expect(stored(s)).toBe(3);
  });

  it('F1 stuffing across 30 days moves nothing: 60 honest ballots plus one host trying for 30 days leave the honest first place first', async () => {
    const s = setup(), all = ['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush'];
    s.setCtl({ minv: 30 });
    // 12 honest networks x 5 ballots, cursor over the rest of a random-ish pair each time
    for (let i = 0; i < 60; i++) await vote(s, blockIp(i), { favorite: 'cursor', tried: ['cursor', all[1 + (i % 7)]], last: 'cursor' });
    for (let day = 0; day < 30; day++) { await fire(s, 8, () => '198.51.100.77', () => ({ favorite: 'brush', tried: all, last: 'draw' })); s.tick(DAY); }
    const r = await readResults(s.redis, NS, 'r3', s.at());
    expect(r.families.desktop.order![0]).toBe('cursor');
    expect(stored(s)).toBe(60 + 10);
  });
});

describe('F2 one attacker address cannot lock its neighbours out of the block', () => {
  const NEIGHBOURS = ['10.9.1.100', '10.9.1.200', '10.9.1.254'];
  it('F2 400 requests from one address, each on a fresh instance (no memory), burn 8 block slots, and the neighbours still vote', async () => {
    const s = setup();
    for (let i = 0; i < 400; i++) { s.deps.memo = new MemoLimit(); await vote(s, '10.9.1.5'); }
    expect(s.redis.counter(`${NS}:rl:b:${D}:${voteKeys('10.9.1.5', SALT, T0).block}`)).toBe(8);
    for (const ip of NEIGHBOURS) expect((await vote(s, ip)).status, ip).toBe(200);
  });

  it('F2 on one instance, 200 requests from one address leave the block memory at 8 (not 200) and the neighbours are not refused from memory', async () => {
    const s = setup(), block = voteKeys('10.9.1.5', SALT, T0).block;
    await fire(s, 200, () => '10.9.1.5');
    expect(s.deps.memo.over(block, D, s.deps.memo.limits.block)).toBe(false);
    for (const ip of NEIGHBOURS) expect((await vote(s, ip)).status, ip).toBe(200);
  });

  it('F2 the same for an IPv6 attacker: refused /64 attempts never move the /48 counter, a second /64 and a neighbour still vote', async () => {
    const s = setup({}, { round: 100 }); // the /48's own round limit (10) is a separate rule, tested in F1
    for (let i = 0; i < 100; i++) { s.deps.memo = new MemoLimit(); await vote(s, '2001:db8:a:55::1'); }
    expect(s.redis.counter(`${NS}:rl:b:${D}:${voteKeys('2001:db8:a:55::1', SALT, T0).block}`)).toBe(8);
    for (const ip of ['2001:db8:a:56::9', '2001:db8:a:ffff::9', '2001:db8:a:1234::7']) expect((await vote(s, ip)).status, ip).toBe(200);
  });

  it('F2 the block limit is 60, so a /24 of honest visitors (60 addresses, one vote each) all count', async () => {
    const s = setup(), out = await fire(s, 60, (i) => `10.9.7.${i + 1}`);
    expect(shape(out)).toEqual({ '200@12': 60 });
  });
});

describe('F3 replays and refusals do not burn the day budget, and the results say when the round is full', () => {
  it('F3 1,200 replays of one code from 1,200 blocks spend nothing: the day counter stays at 1 and honest visitors still vote', async () => {
    const s = setup(), body = voteBody();
    const out = await fire(s, 1200, blockIp, () => body);
    expect(shape(out)).toEqual({ '200@12': 1, '200@6': 1199 });
    expect(s.redis.counter(`${NS}:rlg:${D}`)).toBe(1);
    expect([stored(s), (await vote(s, blockIp(5000))).status]).toEqual([1, 200]);
  });

  it('F3 a replay past the address limit is still answered 200 (its vote is in), at gate A and the undo only', async () => {
    const s = setup({}, { unit: 1 }), body = voteBody();
    expect((await handleVote(voteReq(body), s.deps)).status).toBe(200);
    s.deps.memo = new MemoLimit();
    const c = s.redis.commands, r = await handleVote(voteReq(body), s.deps);
    expect([r.status, s.redis.commands - c, stored(s)]).toEqual([200, 6, 1]);
    expect((await vote(s)).status).toBe(429); // a different code is over the limit
  });

  it('F3 the Retry-After of a global-limit latch is the true time to UTC midnight, and none for the ceiling latch', async () => {
    const s = setup({}, { global: 1, max: 100 });
    await vote(s);
    const g = await vote(s, blockIp(1));
    expect([g.status, g.headers.get('retry-after')]).toEqual([429, String(9 * 3600 + 55 * 60)]);
    const held = await vote(s, blockIp(2)); // the latch answers with the same number
    expect(held.headers.get('retry-after')).toBe(g.headers.get('retry-after'));
  });
});

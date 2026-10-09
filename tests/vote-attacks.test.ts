import { describe, expect, it } from 'vitest';
import { encodeEntry } from '@/lib/vote/entry';
import { handleVote } from '@/server/vote/handlers';
import { readResults } from '@/server/vote/results';
import { D, NS, VOTES, blockIp, fire, json, setup, shape, vote, voteBody, voteReq } from './helpers/voteBody';

// Attack regressions for the server: volume and limits. The finding id is in every title (spec 11.2). Commands are counted exactly.
const LATER = { status: 429, body: { ok: false, error: 'later' } };

const MIDNIGHT = String(9 * 3600 + 55 * 60); // T0 is 14:05 UTC

describe('F1 one host cannot own the day', () => {
  it('F1 200 requests from 200 addresses of one /24: 60 counted, 61 refused at gate B, 79 refused at 0 commands (the block limit is 60, the memo allows twice that)', async () => {
    const s = setup(), out = await fire(s, 200, (i) => `10.1.1.${i + 1}`);
    expect(shape(out, 0, 60)).toEqual({ '200@12': 60 });
    expect(shape(out, 60, 121)).toEqual({ '429@11': 61 });
    expect(shape(out, 121)).toEqual({ '429@0': 79 });
    expect([Object.keys(s.redis.hash(VOTES)).length, s.redis.commands, s.redis.execCalls]).toEqual([60, 60 * 12 + 61 * 11, 60 * 3 + 61 * 2]);
  });

  it('F1 fresh blocks fill the counted day, then 429: 1,200 counted, the 1,201st latches, the rest cost 0', async () => {
    const s = setup(), out = await fire(s, 3000, blockIp);
    expect(shape(out, 0, 1200)).toEqual({ '200@12': 1200 });
    expect(out[1200]).toEqual({ status: 429, cost: 11 });
    expect(shape(out, 1201)).toEqual({ '429@0': 1799 });
    expect([Object.keys(s.redis.hash(VOTES)).length, s.redis.counter(`${NS}:rlg:${D}`), s.redis.commands]).toEqual([1200, 1201, 1200 * 12 + 11]);
  });
});

describe('F2 one address or one block is a few votes a day', () => {
  it('F2 1,000 different /64s inside one /48 store 60 (the block limit of the /48): 60 counted, 61 refused at gate B, 879 refused at 0 commands', async () => {
    const s = setup(), out = await fire(s, 1000, (i) => `2001:db8:abcd:${i.toString(16)}::1`);
    expect(shape(out)).toEqual({ '200@12': 60, '429@11': 61, '429@0': 879 });
    expect([Object.keys(s.redis.hash(VOTES)).length, s.redis.commands]).toEqual([60, 60 * 12 + 61 * 11]);
  });

  it('F2 one IPv4 counts at most 8 a day: 8 counted, 8 refused at gate A, 84 refused at 0 commands', async () => {
    const s = setup(), out = await fire(s, 100, () => '203.0.113.9');
    expect(shape(out)).toEqual({ '200@12': 8, '429@5': 8, '429@0': 84 });
    expect(s.redis.commands).toBe(8 * 12 + 8 * 5);
  });
});

describe('P1 concurrent floods', () => {
  it('P1 1,500 concurrent requests from distinct blocks: exactly 1,200 counted and exactly 300 refused', async () => {
    const s = setup();
    const answers = await Promise.all(Array.from({ length: 1500 }, (_, i) => vote(s, blockIp(i)).then((r) => r.status)));
    expect(answers.filter((c) => c === 200)).toHaveLength(1200);
    expect(answers.filter((c) => c === 429)).toHaveLength(300);
    expect(Object.keys(s.redis.hash(VOTES))).toHaveLength(1200);
  });
});

describe('F3 and P5 the key is the platform address, strictly parsed', () => {
  it('F3 a spoofed x-forwarded-for does not change the key: 25 spoofs from one platform address are one bucket', async () => {
    const s = setup(), codes: number[] = [];
    for (let i = 0; i < 25; i++) codes.push((await handleVote(voteReq(voteBody(), { ip: '203.0.113.9', headers: { 'x-forwarded-for': `198.51.100.${i}, 203.0.113.9` } }), s.deps)).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(8);
    codes.length = 0;
    for (let i = 0; i < 25; i++) codes.push((await handleVote(voteReq(voteBody(), { headers: { 'x-vercel-forwarded-for': '', 'x-real-ip': '', 'x-forwarded-for': `198.51.100.${i}` } }), s.deps)).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(8); // x-forwarded-for alone is ignored: 25 different values share the one bucket 'none'
  });

  it('F3 off Vercel every caller is local: 25 distinct addresses count 8', async () => {
    const s = setup({ onVercel: false });
    const codes: number[] = [];
    for (let i = 0; i < 25; i++) codes.push((await handleVote(voteReq(voteBody(), { ip: blockIp(i), onVercel: false }), s.deps)).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(8);
  });

  it('P5 nine spellings of one address are one key or bad: loose spellings share one bucket, ::ffff:1.2.3.4 is 1.2.3.4', async () => {
    const s = setup(), loose = ['09.9.9.9', '9.9.9.9:1', '9.09.9.9', '1.2.3.4.0', '[::1]', '1.2.3', '256.1.1.1', 'garbage', '0x7f.1', '9.9.9.9%eth0', '::g'];
    const out = await fire(s, loose.length, (i) => loose[i]);
    expect(shape(out)['200@12']).toBe(8);
    const a = await fire(setup(), 9, (i) => (i < 8 ? '::ffff:1.2.3.4' : '1.2.3.4'));
    expect(a[8].status).toBe(429);
    expect((await vote(s, '9.9.9.9')).status).toBe(200); // the strict spelling still has a key of its own
  });
});

describe('F4 refusals stay cheap and stay local', () => {
  it('F4 after the day global limit a fresh-key request costs 0 commands until 60 s pass, then one probe costs 11', async () => {
    const s = setup({}, { global: 10 });
    const out = await fire(s, 11, blockIp);
    expect(shape(out, 0, 10)).toEqual({ '200@12': 10 });
    expect(out[10]).toEqual({ status: 429, cost: 11 });
    expect(shape(await fire(s, 1000, (i) => blockIp(100 + i)))).toEqual({ '429@0': 1000 });
    s.tick(60_001);
    expect(shape(await fire(s, 1, () => blockIp(5000)))).toEqual({ '429@11': 1 });
    expect(shape(await fire(s, 50, (i) => blockIp(6000 + i)))).toEqual({ '429@0': 50 });
  });

  it('F4 a key over its limit is refused alone: the 9th from one address is 429 at 5 commands, a fresh key still counts, no latch', async () => {
    const s = setup(), out = await fire(s, 9, () => '203.0.113.9');
    expect(out[8]).toEqual({ status: 429, cost: 5 });
    expect(shape(await fire(s, 1, () => '198.51.100.9'))).toEqual({ '200@12': 1 });
    expect(s.deps.latch.check(s.at())).toBeNull();
  });
});

describe('F4 the instance memo follows what ctl says', () => {
  it('F4 a raised unit limit lets 20 votes through, and a lowered one refuses from memory from the 5th', async () => {
    expect(shape(await fire(setup({}, { unit: 20, round: 20 }), 20, () => '203.0.113.9'))).toEqual({ '200@12': 20 });
    expect(shape(await fire(setup({}, { unit: 2 }), 10, () => '203.0.113.9'))).toEqual({ '200@12': 2, '429@5': 2, '429@0': 6 });
  });
});

describe('atk:4 and atk:5 over a limit, the answer is honest', () => {
  const stored = (s: ReturnType<typeof setup>) => JSON.stringify(s.redis.hash(VOTES));
  const refused = async (s: ReturnType<typeof setup>, ip: string, after: string | null = MIDNIGHT) => {
    const before = stored(s), logAt = s.redis.log.length;
    const r = await vote(s, ip), at = r.headers.get('retry-after');
    expect([await json(r), at]).toEqual([{ ...LATER }, after]);
    expect(stored(s)).toBe(before);
    expect(s.redis.log.slice(logAt).some((c) => c[0] === 'HSETNX')).toBe(false);
  };

  it('atk:4 the 9th vote of an address, the 61st of a block, the 11th of a network, the 1,201st of a day and one past the ceiling are 429 later, never ok, nothing stored', async () => {
    const u = setup();
    await fire(u, 8, () => '203.0.113.9');
    await refused(u, '203.0.113.9');
    const b = setup();
    await fire(b, 60, (i) => `10.2.2.${i + 1}`);
    await refused(b, '10.2.2.99');
    const r = setup({}, { unit: 20 });
    await fire(r, 10, () => '203.0.113.9');
    await refused(r, '203.0.113.9', null); // the round limit does not lift by itself, so no Retry-After
    const g = setup();
    await fire(g, 1200, blockIp);
    await refused(g, blockIp(9000));
    const m = setup({}, { max: 100 });
    for (let i = 0; i < 100; i++) m.redis.admin(['HSETNX', VOTES, (i + 1).toString(16).padStart(32, '0'), encodeEntry({ device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow'], last: 'flow' }, '2026093014', '0ab')]);
    await refused(m, '203.0.113.9', null); // the round is full: no Retry-After either
  });

  it('atk:5 a shared address of 30 voters: 8 counted, 22 refused (8 at gate A, 14 at 0 commands), and the group counts for cap 5', async () => {
    const four = ['cursor', 'flow', 'draw', 'brush'] as const; // four favorites, 2 each: the favorite cap (R1) leaves the group its 5
    const s = setup(), out = await fire(s, 30, () => '203.0.113.9', (i) => ({ favorite: four[i % 4], tried: [...four], last: 'flow' }));
    expect(shape(out)).toEqual({ '200@12': 8, '429@5': 8, '429@0': 14 });
    expect(s.redis.commands).toBe(8 * 12 + 8 * 5);
    expect((await readResults(s.redis, NS, 'r3', s.at())).families.desktop.votes).toBe(5);
  });
});

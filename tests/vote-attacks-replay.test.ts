import { describe, expect, it, vi } from 'vitest';
import { handleVote } from '@/server/vote/handlers';
import { MemoLimit } from '@/server/vote/memo';
import type { VoteStore } from '@/server/vote/store';
import { D, NS, VOTES, blockIp, fire, setup, shape, vote, voteBody, voteReq } from './helpers/voteBody';

// Attack regressions for the server: replays, lost replies, day buckets, memory and command counts (spec 11.2).
const X = '203.0.113.9';
const stored = (s: ReturnType<typeof setup>) => Object.keys(s.redis.hash(VOTES)).length;

describe('cost:C11 and PRIV-6 the instance memory', () => {
  it('cost:C11 an evicted key reaches gate A again, at 5 commands (accepted residual)', async () => {
    const s = setup({ memo: new MemoLimit(4) });
    expect((await fire(s, 17, () => X))[16]).toEqual({ status: 429, cost: 0 });
    await fire(s, 4, blockIp); // rotating keys push the abusive one out of a 4-key memo
    expect(shape(await fire(s, 1, () => X))).toEqual({ '429@5': 1 });
  });

  it('PRIV-6 no memo entry survives its day', async () => {
    const s = setup();
    await fire(s, 30, blockIp);
    expect(s.deps.memo.size).toBe(60);
    s.tick(24 * 3_600_000);
    await vote(s, '198.51.100.1');
    expect(s.deps.memo.size).toBe(2);
    expect(s.deps.memo.over('any', '20261001', 1)).toBe(false);
  });
});

describe('F6 a nonce is not a credential', () => {
  it('F3 F6 replays of one nonce from 25 blocks count once; each replay costs gate A and the undo (6 commands, 2 round trips) and spends no unit, day, block or round budget', async () => {
    const s = setup(), body = voteBody();
    const out = await fire(s, 25, blockIp, () => body);
    expect(shape(out)).toEqual({ '200@12': 1, '200@6': 24 });
    expect([stored(s), s.redis.counter(`${NS}:rlg:${D}`), s.redis.commands]).toEqual([1, 1, 12 + 24 * 6]);
  });

  it('F6 no Origin and a forged same-origin header pass (CSRF-only, accepted); a cross-site one is 403 at 0 commands', async () => {
    const s = setup(), h = { 'content-type': 'application/json', host: 'halaverga.test', 'x-vercel-forwarded-for': X };
    const post = (extra: Record<string, string>) => handleVote(new Request('https://halaverga.test/api/vote', { method: 'POST', body: JSON.stringify(voteBody()), headers: { ...h, ...extra } }), s.deps);
    expect((await post({})).status).toBe(200); // curl
    expect((await post({ origin: 'https://halaverga.test', 'sec-fetch-site': 'same-origin' })).status).toBe(200); // a script that forges both
    const before = s.redis.commands;
    expect((await post({ origin: 'https://evil.test' })).status).toBe(403);
    expect(s.redis.commands).toBe(before);
  });
});

describe('F7 a lost reply never counts twice', () => {
  it('F7 a timeout after apply, then the same nonce: 502 first, latched 5 s, then 200, and one entry stored', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup(), body = voteBody();
    s.redis.failAfterApply((c) => c[0][0] === 'HSETNX');
    expect((await handleVote(voteReq(body), s.deps)).status).toBe(502);
    expect(stored(s)).toBe(1); // Upstash applied it, the reply was lost
    s.redis.failAfterApply(null);
    expect((await handleVote(voteReq(body), s.deps)).status).toBe(502); // the latch answers first
    s.tick(5001);
    expect((await handleVote(voteReq(body), s.deps)).status).toBe(200);
    expect(stored(s)).toBe(1);
  });

  it('F7 a timeout before apply, then a retry: the retry counts it, once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup(), body = voteBody();
    let drop = true;
    const store: VoteStore = { exec: (c, o) => (drop && c[0][0] === 'HSETNX' ? Promise.reject(new Error('timeout')) : s.redis.exec(c, o)) };
    s.deps.store = store;
    expect((await handleVote(voteReq(body), s.deps)).status).toBe(502);
    expect(stored(s)).toBe(0);
    drop = false; s.tick(5001);
    for (let i = 0; i < 3; i++) expect((await handleVote(voteReq(body), s.deps)).status).toBe(200);
    expect(stored(s)).toBe(1);
  });
});

describe('F9 UTC-day buckets, no rolling window', () => {
  it('F1 F9 four votes an hour from one address for 72 h count 8 on the first UTC day (the day change resets the day counters) and only the rest of the round limit of 10 after that', async () => {
    const s = setup();
    for (let h = 0; h < 72; h++) {
      await fire(s, 4, () => X);
      s.tick(3_600_000);
    }
    const perDay: Record<string, number> = {};
    for (const v of Object.values(s.redis.hash(VOTES))) perDay[String(v).slice(0, 8)] = (perDay[String(v).slice(0, 8)] ?? 0) + 1;
    expect(perDay).toEqual({ '20260930': 8, '20261001': 2 }); // 10 in all: the round counter is the one thing a new day does not reset
  });
});

describe('P3 a vote costs the same commands for any tried set', () => {
  const eight = ['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush'];
  for (const tried of [['cursor', 'flow'], eight]) {
    it(`P3 with ${tried.length} tried: counted 12 commands in 3 round trips, refused at gate A 5 in 1, refused at the global limit 11 in 2`, async () => {
      const over = { tried, favorite: 'flow', last: 'flow' };
      const s = setup(), cost = async (ip: string) => {
        const c = s.redis.commands, e = s.redis.execCalls, r = await vote(s, ip, over);
        return [r.status, s.redis.commands - c, s.redis.execCalls - e];
      };
      expect(await cost('10.9.9.1')).toEqual([200, 12, 3]);
      s.setCtl({ unit: 1 });
      expect(await cost('10.9.9.1')).toEqual([429, 5, 1]);
      s.setCtl({ unit: 8, global: 1 });
      expect(await cost('10.8.8.1')).toEqual([429, 11, 2]);
    });
  }
});

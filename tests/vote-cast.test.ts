import { describe, expect, it } from 'vitest';
import { NONCE_RE } from '@/lib/vote/ballot';
import { PENDING_KEY, readPending } from '@/ui/vote/pending';
import { castVote } from '@/ui/vote/voteClient';
import { bodies, fakeFetch, memory } from './helpers/voteFetch';

const T0 = 1_760_000_000_000;
const answers = { favorite: 'draw', tried: ['brush', 'draw'], last: 'draw' } as const;
const fast = { retryDelayMs: 0, timeoutMs: 200 };

describe('client:C2 castVote keeps one nonce until answered', () => {
  it('saves the pick and nonce before the first request goes out', async () => {
    const s = memory();
    let seen: ReturnType<typeof readPending> = null;
    const { f } = fakeFetch([200], () => { seen = readPending('touch', s, T0); });
    const r = await castVote(answers, 'touch', { ...fast, fetch: f, storage: s, now: () => T0 });
    expect(r.outcome).toBe('ok');
    expect(r.nonce).toMatch(NONCE_RE);
    expect(seen).toEqual({ nonce: r.nonce, favorite: 'draw', tried: ['draw', 'brush'], last: 'draw' });
    expect(s.data[PENDING_KEY]).toBeDefined();
    expect(readPending('touch', s, T0)).toBeNull(); // the 200 cleared it
  });

  it('a failed send keeps the saved code; passing it back resends the same nonce; a first send mints a new one', async () => {
    const s = memory(), opts = { ...fast, storage: s, now: () => T0 };
    const first = fakeFetch([502]);
    const a = await castVote(answers, 'touch', { ...opts, fetch: first.f });
    expect(a.outcome).toBe('error');
    expect(readPending('touch', s, T0)?.nonce).toBe(a.nonce);
    const second = fakeFetch([429]), b = await castVote(answers, 'touch', { ...opts, fetch: second.f, nonce: a.nonce });
    expect(b).toEqual({ outcome: 'later', nonce: a.nonce });
    const third = fakeFetch([200]), c = await castVote(answers, 'touch', { ...opts, fetch: third.f, nonce: b.nonce });
    expect(c.outcome).toBe('ok');
    expect([first, second, third].map(x => JSON.parse(bodies(x.calls)[0]).nonce)).toEqual([a.nonce, a.nonce, a.nonce]);
    expect(readPending('touch', s, T0)).toBeNull();
    expect((await castVote(answers, 'touch', { ...opts, fetch: fakeFetch([200]).f })).nonce).not.toBe(a.nonce);
  });

  it('a changed pick on a resend keeps the nonce and saves the pick that is sent', async () => {
    const s = memory(), opts = { ...fast, storage: s, now: () => T0 };
    const a = await castVote(answers, 'touch', { ...opts, fetch: fakeFetch([502]).f });
    const again = fakeFetch([502]);
    await castVote({ ...answers, favorite: 'brush' }, 'touch', { ...opts, fetch: again.f, nonce: a.nonce });
    expect(JSON.parse(bodies(again.calls)[0])).toMatchObject({ nonce: a.nonce, favorite: 'brush' });
    expect(readPending('touch', s, T0)).toMatchObject({ nonce: a.nonce, favorite: 'brush' });
  });

  it('a device with no storage still sends', async () => {
    const { f, calls } = fakeFetch([200]);
    expect((await castVote(answers, 'touch', { ...fast, fetch: f, storage: null })).outcome).toBe('ok');
    expect(calls).toHaveLength(1);
  });
});

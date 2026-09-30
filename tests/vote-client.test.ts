import { afterEach, describe, expect, it, vi } from 'vitest';
import { controlsFor } from '@/game/controlTypes';
import { NONCE_RE, parseVote, VOTE_MAX_BYTES, VOTE_SCHEMA } from '@/lib/vote/ballot';
import { readPending } from '@/ui/vote/pending';
import { buildPayload, castVote, newNonce, submitVote, VOTE_NAMES, VOTE_URL } from '@/ui/vote/voteClient';
import { readMark } from '@/ui/vote/voteTracker';
import { bodies, fakeFetch, memory } from './helpers/voteFetch';

const N = '0f8fad5bd9cb469fa16570867728950e', T0 = 1_760_000_000_000;
const answers = { favorite: 'draw', tried: ['brush', 'draw'], last: 'draw' } as const;
const payload = buildPayload(answers, 'touch', N);
const fast = { retryDelayMs: 0, timeoutMs: 200 };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('buildPayload', () => {
  it('holds exactly six fields, no free text: v, device, favorite, tried, last, nonce', () => {
    expect(Object.keys(payload)).toEqual(['v', 'device', 'favorite', 'tried', 'last', 'nonce']);
    expect(payload).toEqual({ v: VOTE_SCHEMA, device: 'touch', favorite: 'draw', tried: ['draw', 'brush'], last: 'draw', nonce: N });
    expect(JSON.stringify(payload)).not.toMatch(/note|rating|build|standard/);
  });

  it('tried is this family\'s controls in registry order, always with the pick and last; Can\'t tell adds nothing', () => {
    expect(buildPayload({ favorite: 'flow', tried: ['draw', 'cursor'], last: 'cursor' }, 'desktop', N).tried).toEqual(['cursor', 'flow', 'draw']);
    expect(buildPayload({ favorite: 'tie', tried: ['draw', 'cursor'], last: 'cursor' }, 'desktop', N).tried).toEqual(['cursor', 'draw']);
    expect(buildPayload({ favorite: 'brush', tried: ['draw'], last: 'draw' }, 'touch', N).tried).toEqual(['draw', 'brush']);
    // The other family's ids are dropped (a touch payload never lists cursor), and a duplicate is listed once.
    expect(buildPayload({ favorite: 'draw', tried: ['cursor', 'draw', 'draw', 'brush'], last: 'brush' }, 'touch', N).tried).toEqual(['draw', 'brush']);
  });

  it('a payload the card can build is one the server accepts, for every family and size, and stays far under the byte cap', () => {
    for (const device of ['touch', 'desktop'] as const) {
      const all = controlsFor(device).map(c => c.id);
      for (let n = 2; n <= all.length; n++) for (const favorite of [...all.slice(0, n), 'tie'] as const) {
        const body = JSON.stringify(buildPayload({ favorite, tried: all.slice(0, n), last: all[n - 1] }, device, newNonce()));
        expect(parseVote(body).ok, `${device} ${n} ${favorite}`).toBe(true);
        expect(body.length).toBeLessThan(VOTE_MAX_BYTES / 2);
      }
    }
    expect(parseVote(JSON.stringify(payload)).ok).toBe(true);
  });

  it('a favorite outside the family gives a payload the server refuses', () => {
    expect(parseVote(JSON.stringify(buildPayload({ favorite: 'twin-stick', tried: ['draw', 'brush'], last: 'draw' }, 'desktop', N))).ok).toBe(false);
  });

  it('newNonce is 32 hex, fresh each time, and still works without crypto', () => {
    const seen = new Set(Array.from({ length: 500 }, newNonce));
    expect(seen.size).toBe(500);
    for (const n of seen) expect(n).toMatch(NONCE_RE);
    vi.stubGlobal('crypto', undefined);
    expect(newNonce()).toMatch(NONCE_RE);
  });

  it('the registry names', () => {
    expect(VOTE_NAMES['one-finger']).toBe('One finger');
    expect(Object.keys(VOTE_NAMES)).toHaveLength(10);
  });
});

describe('r2f:10 submitVote: outcomes, one retry for a timeout or 408 only, the same nonce', () => {
  it('200 gives ok, marks the device as voted and clears the saved send code', async () => {
    const s = memory(), { f, calls } = fakeFetch([200]);
    await castVote(answers, 'touch', { ...fast, fetch: async () => { throw new TypeError('x'); }, storage: s, retryDelayMs: 0, now: () => T0, nonce: N }); // saved by the failed try
    expect(readPending('touch', s, T0)?.nonce).toBe(N);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s, now: () => T0 })).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(readMark(s).touch?.at).toBe(T0);
    expect(readPending('touch', s, T0)).toBeNull();
  });

  it.each([[429, 'later'], [503, 'closed'], [403, 'cross']] as const)('%i gives %s: no mark, no retry, the saved code kept', async (status, want) => {
    const s = memory(), { f, calls } = fakeFetch([status, 200]);
    await castVote(answers, 'touch', { ...fast, fetch: fakeFetch([status]).f, storage: s, now: () => T0, nonce: N });
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s, now: () => T0 })).toBe(want);
    expect(calls).toHaveLength(1);
    expect(readMark(s).touch?.at).toBeUndefined();
    expect(readPending('touch', s, T0)?.nonce).toBe(N);
  });

  it.each([400, 413, 415])('%i gives invalid, clears the saved code and is not retried', async status => {
    const s = memory(), { f, calls } = fakeFetch([status, 200]);
    await castVote(answers, 'touch', { ...fast, fetch: fakeFetch([status]).f, storage: s, now: () => T0, nonce: N });
    expect(readPending('touch', s, T0)).toBeNull();
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s, now: () => T0 })).toBe('invalid');
    expect(calls).toHaveLength(1);
    expect(readMark(s).touch?.at).toBeUndefined();
  });

  it.each([500, 502, 504, 404, 301, 418])('%i gives error: never retried, the pick stays saved', async status => {
    const s = memory(), { f, calls } = fakeFetch([status, 200]);
    const { outcome } = await castVote(answers, 'touch', { ...fast, fetch: f, storage: s, now: () => T0, nonce: N });
    expect(outcome).toBe('error');
    expect(calls).toHaveLength(1);
    expect(readPending('touch', s, T0)?.nonce).toBe(N);
    expect(readMark(s).touch?.at).toBeUndefined();
  });

  it('408 is retried once with the same body, and ok on the retry marks voted', async () => {
    const s = memory(), { f, calls } = fakeFetch([408, 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s })).toBe('ok');
    expect(calls).toHaveLength(2);
    expect(new Set(bodies(calls)).size).toBe(1);
    expect(readMark(s).touch?.at).toBeTypeOf('number');
    const twice = fakeFetch([408, 408, 200]);
    expect(await submitVote(payload, { ...fast, fetch: twice.f, storage: memory() })).toBe('network');
    expect(twice.calls).toHaveLength(2);
  });

  it('offline (fetch throws) is retried once with the same nonce; two failures give network', async () => {
    const { f, calls } = fakeFetch(['throw', 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: memory() })).toBe('ok');
    const [a, b] = calls.map(c => JSON.parse(String(c.init?.body)).nonce);
    expect(a).toBe(N); expect(b).toBe(N);
    const dead = fakeFetch(['throw', 'throw', 200]);
    expect(await submitVote(payload, { ...fast, fetch: dead.f, storage: memory() })).toBe('network');
    expect(dead.calls).toHaveLength(2);
  });

  it('aborts an attempt at 7 s, waits 1 s and retries once', async () => {
    vi.useFakeTimers();
    const { f, calls } = fakeFetch(['hang', 200]);
    const done = submitVote(payload, { fetch: f, storage: memory() });
    await vi.advanceTimersByTimeAsync(6999);
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls[0].init?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(await done).toBe('ok');
  });

  it('a hung store twice gives network after about 15 s, not sooner', async () => {
    vi.useFakeTimers();
    const { f, calls } = fakeFetch(['hang']);
    let out = '';
    void submitVote(payload, { fetch: f, storage: memory() }).then(o => { out = o; });
    await vi.advanceTimersByTimeAsync(14999);
    expect(out).toBe('');
    await vi.advanceTimersByTimeAsync(1);
    expect(out).toBe('network');
    expect(calls).toHaveLength(2);
  });

  it('POSTs the JSON body to the relative /api/vote, same-origin, uncached', async () => {
    const { f, calls } = fakeFetch([200]);
    await submitVote(payload, { ...fast, fetch: f, storage: memory() });
    expect(VOTE_URL).toBe('/api/vote');
    expect(calls[0].url).toBe('/api/vote');
    expect(calls[0].init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    expect(new Headers(calls[0].init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(payload);
  });
});

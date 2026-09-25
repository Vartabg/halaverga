import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPayload, submitVote, VOTE_URL } from '@/ui/vote/voteClient';
import { readMark, type VoteStorage } from '@/ui/vote/voteTracker';

function memory(): VoteStorage { const d: Record<string, string> = {}; return { getItem: k => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; }
type Step = number | 'throw' | 'hang';
function fakeFetch(steps: Step[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
    if (step === 'hang') return new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    return Promise.resolve({ status: step, json: async () => ({ ok: step === 200 }) });
  };
  return { f, calls };
}
const payload = buildPayload({ favorite: 'draw', ratings: { draw: 5 }, tried: ['draw', 'brush'] }, 'touch', 'test build');
const fast = { retryDelayMs: 0, timeoutMs: 200 };

afterEach(() => { vi.useRealTimers(); });

describe('submitVote', () => {
  it('200 gives ok and marks the device as voted', async () => {
    const s = memory(), { f, calls } = fakeFetch([200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s, now: () => 42 })).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(readMark(s).at).toBe(42);
  });

  it.each(['too-many', 'busy'])('429 (%s) gives later, marks nothing and sends exactly one request', async () => {
    const s = memory(), { f, calls } = fakeFetch([429, 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s })).toBe('later');
    expect(calls).toHaveLength(1);
    expect(readMark(s).at).toBeUndefined();
  });

  it('503 gives closed with no mark and no retry', async () => {
    const s = memory(), { f, calls } = fakeFetch([503, 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s })).toBe('closed');
    expect(calls).toHaveLength(1);
    expect(readMark(s).at).toBeUndefined();
  });

  it.each([400, 403, 413, 415])('%i gives invalid without a retry', async status => {
    const { f, calls } = fakeFetch([status, 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: memory() })).toBe('invalid');
    expect(calls).toHaveLength(1);
  });

  it('a network error then 200 gives ok after exactly one retry', async () => {
    const s = memory(), { f, calls } = fakeFetch(['throw', 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s })).toBe('ok');
    expect(calls).toHaveLength(2);
    expect(readMark(s).at).toBeTypeOf('number');
  });

  it.each([500, 502, 504])('%i is retried once, then gives network', async status => {
    const s = memory(), { f, calls } = fakeFetch([status, status, 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s })).toBe('network');
    expect(calls).toHaveLength(2);
    expect(readMark(s).at).toBeUndefined();
  });

  it('two network errors give network', async () => {
    const { f, calls } = fakeFetch(['throw', 'throw', 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: memory() })).toBe('network');
    expect(calls).toHaveLength(2);
  });

  it('aborts a request after the 6 s timeout, waits 1 s and retries once', async () => {
    vi.useFakeTimers();
    const { f, calls } = fakeFetch(['hang', 200]);
    const done = submitVote(payload, { fetch: f, storage: memory() });
    await vi.advanceTimersByTimeAsync(5999);
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

  it('POSTs JSON to the relative /api/vote', async () => {
    const { f, calls } = fakeFetch([200]);
    await submitVote(payload, { ...fast, fetch: f, storage: memory() });
    expect(VOTE_URL).toBe('/api/vote');
    expect(calls[0].url).toBe('/api/vote');
    expect(calls[0].init?.method).toBe('POST');
    expect(new Headers(calls[0].init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(payload);
  });
});

describe('buildPayload', () => {
  it('holds only the card answers, device, build and the cleaned note', () => {
    const p = buildPayload({ favorite: 'brush', ratings: { brush: 4, draw: 9 as 5, conduct: 3, standard: 2.5 as 2 }, tried: ['draw', 'standard'],
      note: '  hi\u0007 there\n\n\n\nbye  ' }, 'desktop', 'b');
    expect(Object.keys(p).sort()).toEqual(['build', 'device', 'favorite', 'note', 'ratings', 'tried']);
    expect(p).toEqual({ favorite: 'brush', ratings: { brush: 4 }, tried: ['standard', 'draw', 'brush'], device: 'desktop', build: 'b', note: 'hi there\n\nbye' });
    const bare = buildPayload({ favorite: 'draw', ratings: {}, tried: ['draw'], note: ' \n ' }, 'touch', 'x'.repeat(60));
    expect('note' in bare).toBe(false);
    expect(bare.build).toHaveLength(40);
  });
});

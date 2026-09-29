import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPayload, favoriteOptions, favoritesLine, fetchResults, newNonce, ratingLabs, submitVote, triedSummary, VOTE_NAMES, VOTE_URL } from '@/ui/vote/voteClient';
import { toResults } from '@/server/vote/results';
import { NONCE_RE, parseVote } from '@/lib/vote/shape';
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
const payload = buildPayload({ favorite: 'draw', ratings: { draw: 5 }, tried: ['draw', 'brush'] }, 'touch', 'test build', '0f8fad5b-d9cb-469f-a165-70867728950e');
const fast = { retryDelayMs: 0, timeoutMs: 200 };

afterEach(() => { vi.useRealTimers(); });

describe('submitVote', () => {
  it('200 gives ok and marks the device as voted', async () => {
    const s = memory(), { f, calls } = fakeFetch([200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s, now: () => 42 })).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(readMark(s).touch?.at).toBe(42);
  });

  it.each(['too-many', 'busy'])('429 (%s) gives later, marks nothing and sends exactly one request', async () => {
    const s = memory(), { f, calls } = fakeFetch([429, 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s })).toBe('later');
    expect(calls).toHaveLength(1);
    expect(readMark(s).touch?.at).toBeUndefined();
  });

  it('503 gives closed with no mark and no retry', async () => {
    const s = memory(), { f, calls } = fakeFetch([503, 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s })).toBe('closed');
    expect(calls).toHaveLength(1);
    expect(readMark(s).touch?.at).toBeUndefined();
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
    expect(readMark(s).touch?.at).toBeTypeOf('number');
  });

  it.each([500, 502, 504])('%i is retried once, then gives network', async status => {
    const s = memory(), { f, calls } = fakeFetch([status, status, 200]);
    expect(await submitVote(payload, { ...fast, fetch: f, storage: s })).toBe('network');
    expect(calls).toHaveLength(2);
    expect(readMark(s).touch?.at).toBeUndefined();
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
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent).toEqual(payload); expect(sent.nonce).toMatch(NONCE_RE);
  });

  it('the retry carries the same nonce as the first try; each Send (each buildPayload) gets a new one (review 2026-09-25)', async () => {
    const { f, calls } = fakeFetch(['throw', 200]);
    await submitVote(payload, { ...fast, fetch: f, storage: memory() });
    const [a, b] = calls.map(c => JSON.parse(String(c.init?.body)).nonce);
    expect(a).toMatch(NONCE_RE); expect(b).toBe(a);
    const again = fakeFetch([200]);
    await submitVote(buildPayload({ favorite: 'draw', ratings: {}, tried: ['draw'] }, 'touch', 'test build'), { ...fast, fetch: again.f, storage: memory() });
    expect(JSON.parse(String(again.calls[0].init?.body)).nonce).not.toBe(a);
    expect(parseVote(String(again.calls[0].init?.body)).ok).toBe(true); // the server shape accepts it
  });
});

describe('buildPayload', () => {
  it('holds only v, the card answers, device, build, the send code and the cleaned note', () => {
    const p = buildPayload({ favorite: 'brush', ratings: { brush: 4, draw: 9 as 5, conduct: 3, flow: 2, 'twin-stick': 5 }, tried: ['draw', 'flow'],
      note: '  hi\u0007 there\n\n\n\nbye  ' }, 'desktop', 'b');
    expect(Object.keys(p).sort()).toEqual(['build', 'device', 'favorite', 'nonce', 'note', 'ratings', 'tried', 'v']);
    // Only desktop controls, in registry order; the touch-only twin-stick rating and the unrated (9) draw are dropped.
    expect(p).toMatchObject({ v: 2, favorite: 'brush', ratings: { brush: 4, flow: 2 }, tried: ['flow', 'draw', 'brush'], device: 'desktop', build: 'b', note: 'hi there\n\nbye' });
    const bare = buildPayload({ favorite: 'draw', ratings: {}, tried: ['draw'], note: ' \n ' }, 'touch', 'x'.repeat(60));
    expect('note' in bare).toBe(false);
    expect(bare.build).toHaveLength(40);
    expect(bare.v).toBe(2);
  });

  it('always carries a send code the server accepts, and a fresh one for each Send', () => {
    const a = buildPayload({ favorite: 'draw', ratings: {}, tried: ['draw'] }, 'touch', 'b');
    const b = buildPayload({ favorite: 'draw', ratings: {}, tried: ['draw'] }, 'touch', 'b');
    expect(a.nonce).toMatch(NONCE_RE);
    expect(a.nonce).not.toBe(b.nonce);
    expect(newNonce()).toMatch(NONCE_RE);
    expect(parseVote(JSON.stringify(a)).ok).toBe(true);
  });

  it('a favorite outside the family gives a payload the server refuses', () => {
    const p = buildPayload({ favorite: 'twin-stick', ratings: {}, tried: ['draw'] }, 'desktop', 'b');
    expect(p.tried).toEqual(['draw']);
    expect(parseVote(JSON.stringify(p)).ok).toBe(false);
  });

  it('keeps only the family\'s controls and never sends the old lab names', () => {
    const p = buildPayload({ favorite: 'one-finger', ratings: { 'one-finger': 5, cursor: 2 }, tried: ['cursor', 'one-finger', 'draw'] }, 'touch', 'b');
    expect(p.tried).toEqual(['one-finger', 'draw']);
    expect(p.ratings).toEqual({ 'one-finger': 5 });
    expect(JSON.stringify(p)).not.toContain('standard');
  });
});

describe('the card model per family', () => {
  it('favoriteOptions: this family\'s tried controls in registry order, current first', () => {
    expect(favoriteOptions(['one-finger', 'draw', 'brush'], 'brush', 'touch')).toEqual(['brush', 'one-finger', 'draw']);
    expect(favoriteOptions(['cursor', 'flow', 'draw'], 'cursor', 'desktop')).toEqual(['cursor', 'flow', 'draw']);
    expect(favoriteOptions(['cursor', 'twin-stick', 'draw'], 'draw', 'desktop')).toEqual(['draw', 'cursor']);
    expect(favoriteOptions([], 'conduct', 'touch')).toEqual(['conduct']);
    expect(favoriteOptions([], 'cursor', 'touch')).toEqual(['one-finger', 'twin-stick', 'draw', 'conduct', 'brush']);
  });
  it('ratingLabs: a group for each tried control only', () => {
    expect(ratingLabs(['draw', 'brush'], 'brush', 'touch')).toEqual(['brush', 'draw']);
    expect(ratingLabs(['draw'], 'one-finger', 'touch')).toEqual(['draw']);
    expect(ratingLabs([], 'draw', 'touch')).toEqual([]);
  });
  it('triedSummary: tried X of N and the labels not tried yet, in registry order', () => {
    expect(triedSummary(['cursor', 'draw'], 'desktop')).toEqual({ count: 2, of: 8, left: ['One finger + keys', 'Flow', 'Captured', 'Mouse + keys', 'Conduct', 'Brush'] });
    expect(triedSummary(['one-finger', 'twin-stick', 'draw', 'conduct', 'brush'], 'touch')).toEqual({ count: 5, of: 5, left: [] });
    expect(triedSummary(['cursor'], 'touch')).toEqual({ count: 0, of: 5, left: ['One finger', 'Twin stick', 'Draw', 'Conduct', 'Brush'] });
  });
  it('names come from the registry', () => {
    expect(VOTE_NAMES['one-finger']).toBe('One finger');
    expect(VOTE_NAMES.draw).toBe('Draw');
    expect(Object.keys(VOTE_NAMES)).toHaveLength(10);
  });
});

describe('the tally line and the results shape', () => {
  const r = toResults('r2', { total: 9, 'dev:touch': 6, 'dev:desktop': 3, 'fav:touch:draw': 2, 'fav:touch:one-finger': 4, 'fav:desktop:cursor': 1, 'fav:desktop:draw': 2 }, {});
  it('favoritesLine reads one family, most first, zeros left out', () => {
    expect(favoritesLine(r, 'touch')).toBe('Favorites so far on touch: One finger 4 · Draw 2');
    expect(favoritesLine(r, 'desktop')).toBe('Favorites so far on desktop: Draw 2 · Cursor 1');
    expect(favoritesLine(toResults('r2', {}, {}), 'touch')).toBe('');
    expect(favoritesLine(null, 'touch')).toBe('');
  });
  const reply = (body: unknown, status = 200) => async () => ({ status, json: async () => body });
  it('fetchResults accepts the v2 shape', async () => {
    expect(await fetchResults(reply(JSON.parse(JSON.stringify(r))))).toEqual(r);
  });
  it('fetchResults rejects the old shape, other versions, bad statuses and network errors', async () => {
    const old = { round: 'r1', total: 5, favorite: { standard: 1, draw: 3, conduct: 0, brush: 1 } };
    expect(await fetchResults(reply(old))).toBeNull();
    expect(await fetchResults(reply({ ...r, v: 1 }))).toBeNull();
    expect(await fetchResults(reply({ ...r, families: { touch: r.families.touch } }))).toBeNull();
    expect(await fetchResults(reply({ ...r, families: { touch: {}, desktop: {} } }))).toBeNull();
    expect(await fetchResults(reply(null))).toBeNull();
    expect(await fetchResults(reply(r, 503))).toBeNull();
    expect(await fetchResults(async () => { throw new TypeError('offline'); })).toBeNull();
  });
});

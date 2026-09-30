import { afterEach, describe, expect, it, vi } from 'vitest';
import { BODY_DEADLINE_MS, readBody, refuse, sameOrigin } from '@/server/vote/guards';

const URL_ = 'https://halaverga.test/api/vote';
const req = (headers: Record<string, string> = {}) => new Request(URL_, { method: 'POST', body: '{}', headers: { host: 'halaverga.test', ...headers } });
const bytes = (...parts: (string | number[])[]) => parts.map(p => (typeof p === 'string' ? Array.from(new TextEncoder().encode(p)) : p));
const post = (chunks: number[][] | string, headers: Record<string, string> = {}) => {
  const body = typeof chunks === 'string' ? chunks : new ReadableStream<Uint8Array>({ start(c) { for (const x of chunks) c.enqueue(new Uint8Array(x)); c.close(); } });
  return new Request(URL_, { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
};
// A stream that never ends: pull hands out one small chunk per call (or nothing at all when idle), and cancel is observable.
function endless(opts: { chunk?: number[]; everyMs?: number } = {}) {
  const state = { cancelled: false, pulls: 0 };
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      state.pulls++;
      if (!opts.chunk) return new Promise(() => {});
      return new Promise<void>(res => setTimeout(() => { if (!state.cancelled) c.enqueue(new Uint8Array(opts.chunk!)); res(); }, opts.everyMs ?? 10));
    },
    cancel() { state.cancelled = true; },
  });
  return { state, req: new Request(URL_, { method: 'POST', body, duplex: 'half' } as RequestInit) };
}

afterEach(() => { vi.useRealTimers(); });

describe('sameOrigin (CSRF only, not anti-bot)', () => {
  it('passes a same-origin browser request and one with no Origin or Sec-Fetch-Site (curl)', () => {
    expect(sameOrigin(req({ origin: 'https://halaverga.test', 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(sameOrigin(req({ origin: 'https://halaverga.test' }))).toBe(true);
    expect(sameOrigin(req())).toBe(true);
    expect(sameOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });
  it('refuses a Sec-Fetch-Site that is present and not same-origin', () => {
    for (const s of ['cross-site', 'same-site', 'none', '', 'Same-Origin ']) expect(sameOrigin(req({ 'sec-fetch-site': s, origin: 'https://halaverga.test' })), s).toBe(false);
  });
  it('refuses an Origin whose host is not this request host', () => {
    for (const o of ['https://evil.example', 'null', 'https://halaverga.test.evil.example', 'https://evil.example/https://halaverga.test', 'not a url', '', 'https://halaverga.tes']) expect(sameOrigin(req({ origin: o })), o).toBe(false);
  });
  it('ignores scheme, default port and letter case, and honors the forwarded host behind a proxy', () => {
    expect(sameOrigin(req({ origin: 'http://halaverga.test' }))).toBe(true);
    expect(sameOrigin(req({ origin: 'https://HALAVERGA.TEST' }))).toBe(true);
    expect(sameOrigin(req({ origin: 'https://halaverga.test:8443' }))).toBe(false);
    expect(sameOrigin(req({ host: 'internal:3000', 'x-forwarded-host': 'halaverga.test', origin: 'https://halaverga.test' }))).toBe(true);
    expect(sameOrigin(req({ host: 'internal:3000', origin: 'https://halaverga.test' }))).toBe(false);
    expect(sameOrigin(req({ 'x-forwarded-host': 'a.test, halaverga.test', origin: 'https://halaverga.test' }))).toBe(true); // only the first entry counts, host still matches
  });
});

describe('readBody', () => {
  it('reads a small body as text, and an empty or missing body as an empty string', async () => {
    expect(await readBody(post('{"a":1}'))).toEqual({ ok: true, text: '{"a":1}' });
    expect(await readBody(new Request(URL_, { method: 'POST' }))).toEqual({ ok: true, text: '' });
    expect(await readBody(post([]))).toEqual({ ok: true, text: '' });
  });

  it('accepts exactly max bytes and refuses one more with 413', async () => {
    expect(await readBody(post('x'.repeat(512)), 512)).toMatchObject({ ok: true });
    expect(await readBody(post('x'.repeat(513)), 512)).toEqual({ ok: false, status: 413, error: 'too-large' });
    expect(await readBody(post('x'.repeat(512)))).toMatchObject({ ok: true }); // the default max is the vote's 512
    expect(await readBody(post('x'.repeat(513)))).toMatchObject({ status: 413 });
  });

  it('counts bytes, not characters', async () => {
    expect(await readBody(post('é'.repeat(256)), 512)).toMatchObject({ ok: true });
    expect(await readBody(post('é'.repeat(257)), 512)).toMatchObject({ status: 413 });
  });

  it('refuses a declared length over max without reading the stream', async () => {
    const { state, req: r } = endless();
    const withLength = new Request(URL_, { method: 'POST', body: r.body, headers: { 'content-length': '5000' }, duplex: 'half' } as RequestInit);
    expect(await readBody(withLength, 512)).toEqual({ ok: false, status: 413, error: 'too-large' });
    expect(withLength.body?.locked).toBe(false); // never handed to a reader
    expect(state.pulls).toBeLessThanOrEqual(1); // only the stream's own priming pull
    for (const v of ['abc', '-5', '', '1e2']) expect(await readBody(post('{}', { 'content-length': v }), 512), v).toMatchObject({ ok: true });
    expect(await readBody(post('x'.repeat(600), { 'content-length': '10' }), 512)).toMatchObject({ status: 413 }); // a lying header does not help
  });

  it('cancels a stream the moment it passes the cap, without reading it all', async () => {
    const { state, req: r } = endless({ chunk: Array(100).fill(120), everyMs: 1 });
    expect(await readBody(r, 512, 5000)).toMatchObject({ ok: false, status: 413 });
    expect(state.cancelled).toBe(true);
    expect(state.pulls).toBeLessThan(20);
  });

  it('joins chunks, including a multibyte character split across two', async () => {
    const euro = [0xe2, 0x82, 0xac];
    expect(await readBody(post([[0x7b], [0x22, 0x61, 0x22], [0x3a, 0x22, ...euro.slice(0, 1)], [...euro.slice(1), 0x22, 0x7d]]))).toEqual({ ok: true, text: '{"a":"€"}' });
    expect(await readBody(post(bytes('ab', 'cd', 'ef')))).toEqual({ ok: true, text: 'abcdef' });
  });

  it('P2: invalid UTF-8 is 400, and 500 invalid bytes under the cap is 400 not 413', async () => {
    expect(await readBody(post([[0xff, 0xfe, 0xfd]]))).toEqual({ ok: false, status: 400, error: 'bad-vote' });
    expect(await readBody(post([Array(500).fill(0xff)]))).toEqual({ ok: false, status: 400, error: 'bad-vote' });
    expect(await readBody(post([[0xc3]]))).toMatchObject({ status: 400 }); // truncated sequence
    expect(await readBody(post([[0xc0, 0xaf]]))).toMatchObject({ status: 400 }); // overlong
    expect(await readBody(post([[0xed, 0xa0, 0x80]]))).toMatchObject({ status: 400 }); // an encoded lone surrogate
  });

  it('keeps a byte order mark in the text, so the JSON parse refuses it', async () => {
    const r = await readBody(post([[0xef, 0xbb, 0xbf, 0x7b, 0x7d]]));
    expect(r).toEqual({ ok: true, text: '﻿{}' });
    expect(() => JSON.parse((r as { text: string }).text)).toThrow();
  });

  it('a stream that errors is 400', async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([0x7b])); c.error(new Error('boom')); } });
    expect(await readBody(new Request(URL_, { method: 'POST', body, duplex: 'half' } as RequestInit))).toMatchObject({ ok: false, status: 400 });
  });

  it('P6: a stalled body answers 408 at the 2 s deadline, cancels the reader and leaves no timer', async () => {
    expect(BODY_DEADLINE_MS).toBe(2000);
    vi.useFakeTimers();
    const { state, req: r } = endless();
    const p = readBody(r);
    let done = false;
    void p.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toEqual({ ok: false, status: 408, error: 'slow' });
    expect(state.cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('P6: a slow trickle is cut by the same total deadline, not reset by each chunk', async () => {
    const { state, req: r } = endless({ chunk: [0x20], everyMs: 20 });
    const t0 = Date.now();
    expect(await readBody(r, 512, 150)).toMatchObject({ ok: false, status: 408 });
    expect(Date.now() - t0).toBeLessThan(400);
    expect(state.cancelled).toBe(true);
  });

  it('clears its timer after a body that arrives in time', async () => {
    vi.useFakeTimers();
    expect(await readBody(post('{}'))).toMatchObject({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('refuse', () => {
  it('answers JSON, never cached, with the status and the code and nothing else', async () => {
    const r = refuse(429, 'later', { 'Retry-After': '300' });
    expect(r.status).toBe(429);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('retry-after')).toBe('300');
    expect(await r.json()).toEqual({ ok: false, error: 'later' });
  });
  it('sets no cookie and no CORS header, and adds no extra header by default', () => {
    const r = refuse(400, 'bad-vote');
    expect([...r.headers.keys()].sort()).toEqual(['cache-control', 'content-type']);
    for (const h of ['set-cookie', 'access-control-allow-origin']) expect(r.headers.get(h)).toBeNull();
  });
  it('lets no extra header replace no-store by accident of order', () => {
    expect(refuse(503, 'closed', { 'Retry-After': '60' }).headers.get('cache-control')).toBe('no-store');
  });
});

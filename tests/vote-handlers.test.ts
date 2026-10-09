import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeEntry, encodeEntry } from '@/lib/vote/entry';
import { handleVote, methodNotAllowed } from '@/server/vote/handlers';
import { createUpstashStore } from '@/server/vote/store';
import { utcHour } from '@/server/vote/limits';
import { voteKeys } from '@/server/vote/netkeys';
import { CTL, D, NS, SALT, T0, VOTES, json, setup, vote, voteBody, voteReq } from './helpers/voteBody';

const IP = '203.0.113.9', K = voteKeys(IP, SALT, T0);
const U = `${NS}:rl:u:${D}:${K.unit}`, B = `${NS}:rl:b:${D}:${K.block}`, R = `${NS}:rl:r:${K.round}`, G = `${NS}:rlg:${D}`;
const A = (nonce: unknown) => [['HMGET', CTL, 'mode', 'unit', 'block', 'global', 'max', 'cap', 'minv', 'round'], ['HLEN', VOTES], ['HMGET', VOTES, nonce],
  ['SET', U, 0, 'EX', 90000, 'NX'], ['INCR', U]];
const GB = [['SET', B, 0, 'EX', 90000, 'NX'], ['INCR', B], ['SET', R, 0, 'EX', 2592000, 'NX'], ['INCR', R], ['SET', G, 0, 'EX', 2592000, 'NX'], ['INCR', G]];
const MIDNIGHT = String(9 * 3600 + 55 * 60); // T0 is 14:05 UTC
afterEach(() => vi.restoreAllMocks());
describe('handleVote: the counted path', () => {
  it('answers 503 closed without a store, at 0 commands', async () => {
    const s = setup({ store: null });
    const r = await vote(s);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(await json(r)).toEqual({ status: 503, body: { ok: false, error: 'closed' } });
  });

  it('a counted vote is exactly the section 4.1 commands: gate A, gate B, one HSETNX, in 3 round trips', async () => {
    const s = setup(), body = voteBody({ tried: ['cursor', 'flow', 'brush'], favorite: 'flow', last: 'brush' });
    const r = await handleVote(voteReq(body), s.deps);
    const entry = encodeEntry({ device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow', 'brush'], last: 'brush' }, utcHour(T0), K.tag);
    expect(await json(r)).toEqual({ status: 200, body: { ok: true } });
    expect(s.redis.log).toEqual([...A(body.nonce), ...GB, ['HSETNX', VOTES, body.nonce, entry]]);
    expect([s.redis.commands, s.redis.execCalls]).toEqual([12, 3]);
    expect(decodeEntry(s.redis.hash(VOTES)[body.nonce as string])).toMatchObject({ device: 'desktop', favorite: 'flow', tag: K.tag, hour: utcHour(T0) });
  });

  it('answers with no-store, no cookie and no CORS header', async () => {
    const r = await vote(setup());
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('set-cookie')).toBeNull();
    expect([...r.headers.keys()].filter((h) => h.startsWith('access-control'))).toEqual([]);
  });

  it('F3 CODE-2 a resent nonce answers 200, stores one entry, and costs gate A and one DECR (6 commands, 2 round trips): it spends no unit, block, round or day budget', async () => {
    const s = setup(), body = voteBody();
    expect((await handleVote(voteReq(body), s.deps)).status).toBe(200);
    s.redis.commands = s.redis.execCalls = 0; s.redis.log = [];
    expect((await handleVote(voteReq(body), s.deps)).status).toBe(200);
    expect(Object.keys(s.redis.hash(VOTES))).toEqual([body.nonce]);
    expect([s.redis.commands, s.redis.execCalls, s.redis.log]).toEqual([6, 2, [...A(body.nonce), ['DECR', U]]]);
    expect([s.redis.counter(U), s.redis.counter(B), s.redis.counter(R), s.redis.counter(G)]).toEqual([1, 1, 1, 1]); // the unit counter is back where the first vote left it
  });

  it('is the same for 2 or 8 tried controls', async () => {
    const s = setup(), all = ['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush'];
    await vote(s, IP, { tried: all, favorite: 'brush', last: 'draw' });
    expect([s.redis.commands, s.redis.execCalls]).toEqual([12, 3]);
  });
});

describe('handleVote: refusals and the order of checks', () => {
  it('F3 a vote over its unit limit is 5 commands in 1 round trip, 429 later, Retry-After the true seconds to UTC midnight, and stores nothing', async () => {
    const s = setup({}, { unit: 1 });
    await vote(s);
    s.redis.commands = s.redis.execCalls = 0; s.redis.log = [];
    const body = voteBody(), r = await handleVote(voteReq(body), s.deps);
    expect(r.headers.get('retry-after')).toBe(MIDNIGHT);
    expect(await json(r)).toEqual({ status: 429, body: { ok: false, error: 'later' } });
    expect(s.redis.log).toEqual(A(body.nonce));
    expect([s.redis.commands, s.redis.execCalls, s.redis.counter(G), s.redis.counter(B), s.redis.counter(R)]).toEqual([5, 1, 1, 1, 1]);
  });

  it('a vote over the day global limit is 11 commands in 2 round trips (Retry-After to UTC midnight) and latches the instance for 60 s, then one probe', async () => {
    const s = setup({}, { global: 1 });
    await vote(s);
    s.redis.commands = s.redis.execCalls = 0;
    const r = await vote(s, '198.51.100.1');
    expect([r.status, r.headers.get('retry-after')]).toEqual([429, MIDNIGHT]);
    expect([s.redis.commands, s.redis.execCalls]).toEqual([11, 2]);
    const held = await vote(s, '198.51.100.2');
    expect([held.status, held.headers.get('retry-after'), s.redis.commands]).toEqual([429, MIDNIGHT, 11]);
    s.tick(61_000);
    await vote(s, '198.51.100.3');
    expect(s.redis.commands).toBe(22);
  });

  it('the main ceiling: 429 at 5 commands with no Retry-After (the round is full, it will not lift by itself), then 0 for 60 s, then one more probe', async () => {
    const s = setup({}, { max: 100 });
    for (let i = 0; i < 100; i++) s.redis.admin(['HSETNX', VOTES, (i + 1).toString(16).padStart(32, '0'), encodeEntry({ device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow'], last: 'flow' }, utcHour(T0), '0ab')]);
    const r = await vote(s);
    expect([r.status, r.headers.get('retry-after'), s.redis.commands]).toEqual([429, null, 5]);
    const held = await vote(s, '198.51.100.7');
    expect([held.headers.get('retry-after'), s.redis.commands]).toEqual([null, 5]);
    s.tick(60_001);
    await vote(s, '198.51.100.8');
    expect(s.redis.commands).toBe(10);
  });

  it('ctl mode closed and any unknown mode answer 503 closed at 5 commands, then 0 for 30 s; HDEL reopens after that', async () => {
    for (const mode of ['closed', 'shut', 'OPEN', '']) {
      const s = setup({}, { mode });
      const r = await vote(s);
      expect([r.status, r.headers.get('retry-after'), s.redis.commands]).toEqual([503, '60', 5]);
      await vote(s, '198.51.100.1');
      expect(s.redis.commands).toBe(5);
      s.redis.admin(['HDEL', CTL, 'mode']);
      expect((await vote(s, '198.51.100.2')).status).toBe(503); // still latched
      s.tick(30_001);
      expect((await vote(s, '198.51.100.3')).status).toBe(200);
    }
  });

  it('garbage knobs are ignored (the defaults apply) and a clamp edge holds', async () => {
    const s = setup({}, { unit: 'abc', block: '-1', global: '1.5', max: '99999999', cap: '0', minv: 'x' });
    const codes: number[] = [];
    for (let i = 0; i < 9; i++) codes.push((await vote(s)).status);
    expect(codes).toEqual([...Array(8).fill(200), 429]); // unit stayed 8
    const t = setup({}, { unit: 1 }), c2: number[] = [];
    for (let i = 0; i < 2; i++) c2.push((await vote(t)).status);
    expect(c2).toEqual([200, 429]);
    const u = setup({}, { unit: 0 }); // one under the clamp: ignored
    for (let i = 0; i < 8; i++) expect((await vote(u)).status).toBe(200);
  });

  it('checks in order: latch, origin, content type, size, body, shape, then the memo, and each costs 0 commands', async () => {
    const s = setup();
    const pulled = { n: 0 };
    const stream = () => new ReadableStream({ pull(c) { pulled.n++; c.enqueue(new TextEncoder().encode('{}')); c.close(); } }, { highWaterMark: 0 });
    const withStream = (headers: Record<string, string>) => new Request('https://halaverga.test/api/vote', { method: 'POST', body: stream(), headers, duplex: 'half' } as RequestInit);
    const h = { host: 'halaverga.test', origin: 'https://halaverga.test', 'content-type': 'application/json' };
    expect((await handleVote(withStream({ ...h, origin: 'https://evil.test', 'content-type': 'text/plain' }), s.deps)).status).toBe(403); // origin first
    expect((await handleVote(withStream({ ...h, 'content-type': 'text/plain' }), s.deps)).status).toBe(415);
    expect((await handleVote(withStream({ ...h, 'content-length': '513' }), s.deps)).status).toBe(413);
    expect(pulled.n).toBe(0); // no body was read for any of them
    expect((await handleVote(withStream(h), s.deps)).status).toBe(400); // read, but not a vote
    expect(pulled.n).toBe(1);
    s.deps.latch.set(T0 + 5000, 503, 'closed', 60);
    expect((await handleVote(withStream(h), s.deps)).status).toBe(503);
    expect(pulled.n).toBe(1); // a latched instance answers before the body is read
    expect([s.redis.commands, s.deps.memo.size]).toEqual([0, 0]); // and nothing malformed reached the memo
  });

  it('cross-site is 403 at 0 commands, and a forwarded host is honored behind a proxy', async () => {
    const s = setup();
    for (const headers of [{ 'sec-fetch-site': 'cross-site' }, { origin: 'https://evil.example' }, { origin: 'null' }] as Record<string, string>[]) {
      expect((await handleVote(voteReq(voteBody(), { headers }), s.deps)).status).toBe(403);
    }
    expect(s.redis.execCalls).toBe(0);
    const proxied = voteReq(voteBody(), { headers: { host: 'internal:3000', 'x-forwarded-host': 'halaverga.test' } });
    expect((await handleVote(proxied, s.deps)).status).toBe(200);
  });

  it('gives 400 for a bad shape (a v2 body, a note, one tried control) and 413 for a big body, at 0 commands', async () => {
    const s = setup();
    for (const b of [voteBody({ v: 2 }), voteBody({ note: 'hi' }), voteBody({ tried: ['flow'] }), '{nope']) expect((await handleVote(voteReq(b), s.deps)).status).toBe(400);
    expect((await handleVote(voteReq('x'.repeat(513)), s.deps)).status).toBe(413);
    expect(s.redis.execCalls).toBe(0);
  });

  it('methodNotAllowed is 405 with Allow: POST and no store', async () => {
    const r = methodNotAllowed();
    expect(r.headers.get('allow')).toBe('POST');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await json(r)).toEqual({ status: 405, body: { ok: false, error: 'method' } });
  });
});

describe('handleVote: store failures', () => {
  it('a store error is 502 store-failed, Retry-After 5, one console.error without data, then 0 commands for 5 s', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup();
    s.redis.failWith = new Error('boom https://db.upstash.io tok-secret');
    const r = await vote(s);
    expect([r.status, r.headers.get('retry-after')]).toEqual([502, '5']);
    expect(err.mock.calls).toEqual([['[vote] store request failed']]);
    s.redis.failWith = null;
    const calls = s.redis.execCalls;
    expect((await vote(s, '198.51.100.1')).status).toBe(502);
    expect(s.redis.execCalls).toBe(calls);
    s.tick(5001);
    expect((await vote(s, '198.51.100.2')).status).toBe(200);
  });

  it('a malformed store reply is a 502, never a guess: a short gate reply, a text counter, a bad gate B, a write reply that is not 0 or 1', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = [Array(8).fill(null), 0, [null], 'OK', 1], gb = ['OK', 1, 'OK', 1, 'OK', 1];
    for (const replies of [[[]], [[...ok.slice(0, 3), 'x', 1]], [[ok[0], ok[1], 'e', 'OK', 1]], [ok, ['OK']], [ok, gb, ['maybe']]]) {
      const queue = [...replies];
      expect((await vote(setup({ store: { exec: async () => queue.shift()! } }))).status).toBe(502);
    }
  });

  it('no response, header or log line contains the address, nonce, salt, token, URL or a key', async () => {
    const logs: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => { logs.push(a); });
    vi.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a); });
    const dead = createUpstashStore('https://db.upstash.io', 'tok-secret', async () => { throw new Error('connect https://db.upstash.io tok-secret'); });
    const body = voteBody(), out: unknown[] = [];
    const runs = [setup({ store: dead }), setup({}, { mode: 'closed' }), setup({}, { unit: 1 }), setup()];
    for (const s of runs) for (const b of [body, body, '{nope']) {
      const r = await handleVote(voteReq(b), s.deps);
      out.push(await r.text(), [...r.headers.entries()]);
    }
    const text = JSON.stringify([out, logs]);
    for (const secret of [IP, body.nonce, SALT, 'tok-secret', 'upstash', NS, K.unit, K.block, 'rl:']) expect(text).not.toContain(secret);
  });
});

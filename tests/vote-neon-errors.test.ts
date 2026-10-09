import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNeonStore } from '@/server/vote/neonStore';
import type { Command, FetchLike } from '@/server/vote/store';
import { canned, CS, HOST, INCR, MARKERS, PARAM, PW, rowsAt, spies, surface, USER } from './helpers/neonKit';

let logs: ReturnType<typeof spies>;
beforeEach(() => { logs = spies(); });
afterEach(() => { for (const s of logs) expect(s).not.toHaveBeenCalled(); vi.restoreAllMocks(); });

describe('errors and redaction (spec-neon 5.2, 5.4)', () => {
  const body = { message: `SECRET-BODY ${PW}`, code: '42501', detail: `SECRET-BODY ${HOST}` };
  it.each([400, 413, 429, 500, 503, 507, 408])('HTTP %i throws "vote store http <status>" and nothing of the body', async (status) => {
    const err = (await createNeonStore(CS, canned(status, body)).exec([['HSETNX', 'k', 'f', PARAM]]).catch((e: Error) => e)) as Error & { sqlstate?: string };
    expect(err.message).toBe(`vote store http ${status}`);
    expect(err.sqlstate).toBe(status === 400 ? '42501' : undefined);
    for (const m of MARKERS) expect(surface(err), m).not.toContain(m);
  });

  it('keeps only a five-character SQLSTATE from a 400 body, and survives a body that is not JSON', async () => {
    for (const b of [{ code: 'not a code' }, { code: 42501 }, { code: '4250' }, { code: '42p01' }, null, '<html>SECRET-BODY</html>', 'x'.repeat(100_000)]) {
      const err = (await createNeonStore(CS, canned(400, b)).exec(INCR).catch((e: Error) => e)) as Error & { sqlstate?: string };
      expect(err.message).toBe('vote store http 400');
      expect(err.sqlstate).toBeUndefined();
      expect(surface(err)).not.toContain('SECRET-BODY');
    }
  });

  it('a fetch that rejects becomes "vote store network" with no cause, whatever it said', async () => {
    const f: FetchLike = async () => { throw Object.assign(new TypeError(`fetch failed ${HOST} ${CS}`), { cause: new Error(`getaddrinfo ENOTFOUND ${HOST}`) }); };
    const err = (await createNeonStore(CS, f).exec(INCR).catch((e: Error) => e)) as Error;
    expect([err.message, err.name, 'cause' in err]).toEqual(['vote store network', 'Error', false]);
    for (const m of MARKERS) expect(surface(err), m).not.toContain(m);
    // a redirect is refused by fetch itself and lands here too
    const red: FetchLike = async (_u, init) => { expect(init.redirect).toBe('error'); throw new TypeError('redirect'); };
    await expect(createNeonStore(CS, red).exec(INCR)).rejects.toThrow('vote store network');
  });

  it('a timeout is a TimeoutError named error with the same fixed message; opts.timeoutMs replaces the default for that call only', async () => {
    const hang: FetchLike = (_u, init) => new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error(`aborted ${HOST}`))));
    const store = createNeonStore(CS, hang, 60_000);
    const t0 = Date.now();
    const err = (await store.exec(INCR, { timeoutMs: 30 }).catch((e: Error) => e)) as Error;
    expect([err.message, err.name, Date.now() - t0 < 2000]).toEqual(['vote store network', 'TimeoutError', true]);
    for (const m of MARKERS) expect(surface(err), m).not.toContain(m);
    let sig: AbortSignal | null | undefined;
    const long = createNeonStore(CS, (_u, init) => { sig = init.signal; return hang(_u, init); }, 20);
    const p = long.exec(INCR, { timeoutMs: 5000 }).catch(() => 'late');
    await new Promise((r) => setTimeout(r, 120));
    expect(sig?.aborted).toBe(false); // the longer per-call value won over the 20 ms default
    await new Promise((r) => setTimeout(r, 0));
    void p;
  });

  it('a 200 that is not the envelope is "vote store bad reply", without quoting the body', async () => {
    const bads: unknown[] = ['not json SECRET-BODY {', '', 'null', '[]', '{}', { results: 'x' }, { results: {} }, { results: [] }, { results: Array(99).fill({ rows: [] }) }];
    for (const b of bads) {
      const err = (await createNeonStore(CS, canned(200, b)).exec(INCR).catch((e: Error) => e)) as Error;
      expect(err.message, String(b)).toBe('vote store bad reply');
      expect(surface(err)).not.toContain('SECRET-BODY');
    }
  });

  it('a 200 with one result too many or too few is a bad reply even when every reply that is read would map', async () => {
    for (const delta of [1, -1]) {
      const err = (await createNeonStore(CS, canned(200, (n: number) => rowsAt(5, [['1']])(n + delta))).exec(INCR).catch((e: Error) => e)) as Error;
      expect(err.message, String(delta)).toBe('vote store bad reply');
    }
  });

  it('a mapper rejection is "vote store bad reply": wrong rows, wrong cell type, an unsafe integer', async () => {
    for (const [cmd, rows] of [[['INCR', 'k'], [['9007199254740992']]], [['INCR', 'k'], [[7]]], [['HLEN', 'k'], []], [['HLEN', 'k'], [[`${PARAM}`]]], [['SET', 'k', 0, 'EX', 5, 'NX'], [['2']]], [['HMGET', 'k', 'a', 'b'], [['x']]]] as [Command, unknown][]) {
      const err = (await createNeonStore(CS, canned(200, rowsAt(5, rows))).exec([cmd]).catch((e: Error) => e)) as Error;
      expect(err.message, JSON.stringify(cmd)).toBe('vote store bad reply');
      expect(surface(err)).not.toContain(PARAM);
    }
  });

  it('a result element that is not an object is a bad reply', async () => {
    const err = await createNeonStore(CS, canned(200, (n: number) => ({ results: Array(n).fill(null) }))).exec(INCR).catch((e: Error) => e);
    expect((err as Error).message).toBe('vote store bad reply');
  });

  it('a 200 that cannot be read in time is a timeout, not a bad reply', async () => {
    const f: FetchLike = async (_u, init) => {
      const stream = new ReadableStream({ start(c) { init.signal?.addEventListener('abort', () => c.error(new Error(`aborted ${HOST}`))); } });
      return new Response(stream, { status: 200 });
    };
    const err = (await createNeonStore(CS, f).exec(INCR, { timeoutMs: 30 }).catch((e: Error) => e)) as Error;
    expect([err.message, err.name]).toEqual(['vote store network', 'TimeoutError']);
  });
});

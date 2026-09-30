import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLEAN, CLEAN_EVERY_MS, DDL, NEON_TIMEOUT_MS, PRELUDE_LEN } from '@/server/vote/neonSchema';
import { createNeonStore } from '@/server/vote/neonStore';
import type { Command, FetchLike } from '@/server/vote/store';
import { FakeNeon } from './helpers/fakeNeon';
import { canned, CS, HOST, INCR, PARAM, PW, queriesOf, spies, surface } from './helpers/neonKit';

let logs: ReturnType<typeof spies>;

beforeEach(() => { logs = spies(); });
afterEach(() => { for (const s of logs) expect(s).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('request shape (spec-neon 1.2, 1.3)', () => {
  it('one fetch per exec: POST https://<host>/sql with exactly the documented headers and a {queries} body', async () => {
    const neon = new FakeNeon(() => 0, CS);
    let seen: RequestInit = {};
    const store = createNeonStore(CS, (u, i) => { seen = i; return neon.fetch(u, i); });
    expect(await store.exec([['INCR', 'k'], ['HLEN', 'h'], ['HMGET', 'h', 'a', 'b']])).toEqual([1, 0, [null, null]]);
    expect(neon.calls).toHaveLength(1);
    expect(neon.violations).toEqual([]);
    expect(neon.calls[0].url).toBe(`https://${HOST}/sql`);
    expect(seen.method).toBe('POST');
    expect(Object.keys(seen.headers as object).sort()).toEqual(['Content-Type', 'Neon-Array-Mode', 'Neon-Batch-Isolation-Level', 'Neon-Connection-String', 'Neon-Raw-Text-Output']);
    expect(seen.headers).toMatchObject({ 'Neon-Connection-String': CS, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'true', 'Neon-Batch-Isolation-Level': 'ReadCommitted', 'Content-Type': 'application/json' });
    expect(seen.signal).toBeInstanceOf(AbortSignal);
    expect(seen.redirect).toBe('error'); // a redirect must never carry the connection-string header elsewhere
    expect(Object.keys(JSON.parse(String(seen.body)))).toEqual(['queries']);
    expect(JSON.stringify(seen.headers)).not.toMatch(/authorization|cookie/i);
    expect(neon.calls[0].url.includes(PW) || neon.calls[0].url.includes('?')).toBe(false); // mutation: connection string in the URL
  });

  it('lowercases the host, ignores a port, and rejects an unusable string with a fixed message', async () => {
    const neon = new FakeNeon(() => 0, undefined, 'ep-up.neon.example');
    await createNeonStore('postgresql://u:p@EP-UP.Neon.Example:5432/db', neon.fetch).exec(INCR);
    expect(neon.calls[0].url).toBe('https://ep-up.neon.example/sql');
    for (const bad of ['', 'postgresql://u@h.io/db', 'http://u:p@h.example.io/db', `postgresql://u:${PW}@nodot/db`]) {
      const err = (() => { try { createNeonStore(bad, neon.fetch); } catch (e) { return e as Error; } })();
      expect(err?.message).toBe('vote store bad connection string');
    }
  });

  it('reports the call budget: 3 s by default (a cold compute wakes on the first call)', () => {
    expect(NEON_TIMEOUT_MS).toBe(3000);
    expect(createNeonStore(CS, new FakeNeon().fetch).callBudgetMs).toBe(3000);
    expect(createNeonStore(CS, new FakeNeon().fetch, 1234).callBudgetMs).toBe(1234);
  });

  it('never calls fetch for a command it cannot translate', async () => {
    const f = canned(200, {});
    const store = createNeonStore(CS, f);
    for (const c of [['GET', 'k'], ['INCR', `x\u0000${PARAM}`], ['SET', 'k', 'v']] as Command[]) {
      const err = await store.exec([c]).catch((e: Error) => e);
      expect((err as Error).message).toMatch(/^vote store (unsupported command|bad argument)$/);
      expect(surface(err)).not.toContain(PARAM);
    }
    expect(f.n).toBe(0);
  });
});

describe('lazy table creation (spec-neon 3.2)', () => {
  it('the first exec carries the five DDL entries first and the caller gets one reply per command; the second carries none', async () => {
    const neon = new FakeNeon();
    const store = createNeonStore(CS, neon.fetch);
    expect(await store.exec([['INCR', 'a'], ['INCR', 'a']])).toEqual([1, 2]);
    expect(queriesOf(neon, 0).slice(0, PRELUDE_LEN)).toEqual([...DDL]);
    expect(neon.calls[0].queries.slice(0, PRELUDE_LEN).every((q) => q.params.length === 0)).toBe(true);
    expect(await store.exec([['INCR', 'a']])).toEqual([3]);
    expect(queriesOf(neon, 1).some((q) => DDL.includes(q))).toBe(false);
    expect(neon.violations).toEqual([]);
  });

  it('a first exec that fails leaves the DDL owed: the next batch carries it again', async () => {
    const neon = new FakeNeon();
    neon.hooks.push(() => new Response('{"message":"x"}', { status: 500 }));
    const store = createNeonStore(CS, neon.fetch);
    await expect(store.exec(INCR)).rejects.toThrow('vote store http 500');
    await expect(store.exec(INCR)).resolves.toEqual([1]);
    expect(queriesOf(neon, 1).slice(0, PRELUDE_LEN)).toEqual([...DDL]);
    await store.exec(INCR);
    expect(queriesOf(neon, 2).some((q) => DDL.includes(q))).toBe(false);
  });

  it.each(['23505', '42P07', '42710'])('the concurrent-DDL race %s is resent once, at once, and succeeds', async (code) => {
    const neon = new FakeNeon();
    neon.raceOnce(code);
    await expect(createNeonStore(CS, neon.fetch).exec(INCR)).resolves.toEqual([1]);
    expect(neon.calls).toHaveLength(2);
    expect(queriesOf(neon, 1)).toEqual(queriesOf(neon, 0));
  });

  it('two failures throw; a race code on a batch WITHOUT the DDL is not retried; another code is not retried', async () => {
    const neon = new FakeNeon();
    const store = createNeonStore(CS, neon.fetch);
    neon.hooks.push(() => Response.json({ code: '23505' }, { status: 400 }), () => Response.json({ code: '23505' }, { status: 400 }));
    await expect(store.exec(INCR)).rejects.toThrow('vote store http 400');
    expect(neon.calls).toHaveLength(2);
    await store.exec(INCR); // ready now
    neon.hooks.push(() => Response.json({ code: '23505' }, { status: 400 }));
    await expect(store.exec(INCR)).rejects.toThrow('vote store http 400');
    expect(neon.calls).toHaveLength(4);
    const other = new FakeNeon();
    other.hooks.push(() => Response.json({ code: '42501' }, { status: 400 }));
    await expect(createNeonStore(CS, other.fetch).exec(INCR)).rejects.toMatchObject({ sqlstate: '42501' });
    expect(other.calls).toHaveLength(1);
  });

  it('the retry gets only what is left of the caller budget, and is skipped under 250 ms', async () => {
    const run = async (spent: number) => {
      let t = 0, n = 0;
      const f: FetchLike = (_u, init) => {
        n++;
        if (n === 1) { t += spent; return Promise.resolve(Response.json({ code: '23505' }, { status: 400 })); }
        return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      };
      const t0 = Date.now();
      const err = await createNeonStore(CS, f, 60_000, () => t).exec(INCR).catch((e: Error) => e);
      return { n, err: err as Error, ms: Date.now() - t0 };
    };
    const retried = await run(59_700); // 300 ms left: retried, and cut off at about 300 ms, not the original 60 s
    expect([retried.n, retried.err.name, retried.ms < 3000]).toEqual([2, 'TimeoutError', true]);
    expect((await run(59_800)).n).toBe(1); // 200 ms left: no retry
  });

  it('42P01 on a batch without the DDL throws and owes the DDL again (dropped tables heal on the next batch)', async () => {
    const neon = new FakeNeon();
    const store = createNeonStore(CS, neon.fetch);
    await store.exec(INCR);
    neon.drop();
    await expect(store.exec(INCR)).rejects.toMatchObject({ message: 'vote store http 400', sqlstate: '42P01' });
    expect(neon.calls).toHaveLength(2); // no automatic resend
    await expect(store.exec(INCR)).resolves.toEqual([1]);
    expect(queriesOf(neon, 2).slice(0, PRELUDE_LEN)).toEqual([...DDL]);
  });
});

describe('opportunistic cleanup (spec-neon 3.3)', () => {
  it('a batch with SET or INCR carries CLEAN last, first at once and then only every 10 minutes; its reply is sliced off', async () => {
    let t = 1_000_000;
    const neon = new FakeNeon(() => t);
    const store = createNeonStore(CS, neon.fetch, undefined, () => t);
    expect(await store.exec([['INCR', 'a']])).toEqual([1]);
    expect(queriesOf(neon, 0).at(-1)).toBe(CLEAN);
    t += 1000; await store.exec([['INCR', 'a']]);
    expect(queriesOf(neon, 1)).not.toContain(CLEAN);
    t += CLEAN_EVERY_MS - 1001; await store.exec([['SET', 'b', 0, 'EX', 5, 'NX']]);
    expect(queriesOf(neon, 2)).not.toContain(CLEAN);
    t += 1; expect(await store.exec([['SET', 'c', 0, 'EX', 5, 'NX'], ['INCR', 'c']])).toEqual(['OK', 1]);
    expect(queriesOf(neon, 3).filter((q) => q === CLEAN)).toHaveLength(1);
    expect(queriesOf(neon, 3).at(-1)).toBe(CLEAN);
  });

  it('a batch of only reads or HSETNX never carries it, however long ago the last one was', async () => {
    let t = 0;
    const neon = new FakeNeon(() => t);
    const store = createNeonStore(CS, neon.fetch, undefined, () => t);
    t += CLEAN_EVERY_MS * 5;
    for (const c of [['HGETALL', 'h'], ['HMGET', 'h', 'a'], ['HSETNX', 'h', 'f', 'v'], ['SMEMBERS', 's'], ['HLEN', 'h']] as Command[]) { await store.exec([c]); t += CLEAN_EVERY_MS * 5; }
    for (let i = 0; i < 5; i++) expect(queriesOf(neon, i)).not.toContain(CLEAN);
  });

  it('a failing cleanup does not repeat on every batch: the time is recorded when it is added', async () => {
    let t = 0;
    const neon = new FakeNeon(() => t);
    neon.hooks.push(() => new Response('{}', { status: 500 }));
    const store = createNeonStore(CS, neon.fetch, undefined, () => t);
    await expect(store.exec(INCR)).rejects.toThrow();
    t += 1000; await store.exec(INCR);
    expect(queriesOf(neon, 1)).not.toContain(CLEAN);
  });
});

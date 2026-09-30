import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRedis, type RawReply } from './fixtures/fake-redis';
import type { Command } from '@/server/vote/store';

const errs = (raw: RawReply[]) => raw.map((r) => ('error' in r ? r.error : null));
const one = async (r: FakeRedis, ...cmd: Command) => (await r.exec([cmd]))[0];
const clocked = () => { let t = 1_000_000; const r = new FakeRedis(() => t); return { r, tick: (ms: number) => { t += ms; } }; };

afterEach(() => { vi.useRealTimers(); });

describe('fake-redis strings, counters and expiry', () => {
  it('SET replies OK, SET NX replies null on a live key and keeps the old value, GET reads it', async () => {
    const r = new FakeRedis();
    expect(await r.exec([['SET', 'a', 0, 'EX', 90000, 'NX'], ['SET', 'a', 5, 'NX'], ['GET', 'a'], ['GET', 'nope']])).toEqual(['OK', null, '0', null]);
  });
  it('the gate A batch replies with Upstash shapes: 7 nulls for a missing ctl, 0, OK, 1, OK, 1', async () => {
    const r = new FakeRedis();
    const gate: Command[] = [
      ['HMGET', 'ns:ctl', 'mode', 'unit', 'block', 'global', 'max', 'cap', 'minv'], ['HLEN', 'ns:vote'],
      ['SET', 'u', 0, 'EX', 90000, 'NX'], ['INCR', 'u'], ['SET', 'b', 0, 'EX', 90000, 'NX'], ['INCR', 'b'],
    ];
    expect(await r.exec(gate)).toEqual([Array(7).fill(null), 0, 'OK', 1, 'OK', 1]);
    expect(await r.exec(gate)).toEqual([Array(7).fill(null), 0, null, 2, null, 2]);
    expect(r.execCalls).toBe(2);
    expect(r.commands).toBe(12);
  });
  it('INCR starts at 1, counts up, keeps the TTL and errors on a non-integer string', async () => {
    const { r, tick } = clocked();
    await r.exec([['SET', 'c', 0, 'EX', 10, 'NX']]);
    expect(await r.exec([['INCR', 'c'], ['INCR', 'c'], ['INCR', 'fresh']])).toEqual([1, 2, 1]);
    expect(await one(r, 'TTL', 'c')).toBe(10);
    tick(9_000);
    expect(await one(r, 'TTL', 'c')).toBe(1);
    await r.exec([['SET', 'w', 'abc']]);
    expect(errs(r.execRaw([['INCR', 'w']]))).toEqual(['ERR value is not an integer or out of range']);
  });
  it('CODE-2 DECR mirrors INCR: -1 on a missing key, counts down from an INCR, keeps the TTL, errors on a non-integer string or a hash', async () => {
    const { r, tick } = clocked();
    await r.exec([['SET', 'c', 0, 'EX', 10, 'NX']]);
    expect(await r.exec([['INCR', 'c'], ['INCR', 'c'], ['DECR', 'c'], ['DECR', 'c'], ['DECR', 'gone']])).toEqual([1, 2, 1, 0, -1]);
    tick(4_000);
    expect(await one(r, 'TTL', 'c')).toBe(6);
    await r.exec([['SET', 'w', 'abc'], ['HSET', 'h', 'f', 'v']]);
    expect(errs(r.execRaw([['DECR', 'w'], ['DECR', 'h'], ['DECR']]))).toEqual(['ERR value is not an integer or out of range', expect.stringContaining('WRONGTYPE'), "ERR wrong number of arguments for 'decr' command"]);
  });
  it('lazy expiry on the injected clock: gone at the deadline, SET NX succeeds again, counters restart, keys() hides it', async () => {
    const { r, tick } = clocked();
    await r.exec([['SET', 'k', 'v', 'EX', 5, 'NX'], ['INCR', 'k2']]);
    tick(4_999);
    expect(await one(r, 'GET', 'k')).toBe('v');
    tick(1);
    expect(await r.exec([['GET', 'k'], ['TTL', 'k'], ['SET', 'k', 'v2', 'EX', 5, 'NX'], ['GET', 'k']])).toEqual([null, -2, 'OK', 'v2']);
    expect(r.keys().sort()).toEqual(['k', 'k2']);
    tick(5_000);
    expect(r.keys()).toEqual(['k2']);
    expect(r.counter('k2')).toBe(1);
  });
  it('a plain SET clears the TTL, EXPIRE sets one, TTL is -1 without one and -2 when missing', async () => {
    const { r } = clocked();
    expect(await r.exec([['SET', 'k', 1, 'EX', 50], ['SET', 'k', 2], ['TTL', 'k'], ['EXPIRE', 'k', 30], ['TTL', 'k'], ['EXPIRE', 'none', 30], ['TTL', 'none']]))
      .toEqual(['OK', 'OK', -1, 1, 30, 0, -2]);
  });
  it('DEL counts live keys removed (several at once) and FLUSHALL empties everything', async () => {
    const r = new FakeRedis();
    await r.exec([['SET', 'a', 1], ['HSET', 'h', 'f', 'v'], ['SADD', 's', 'm']]);
    expect(await one(r, 'DEL', 'a', 'h', 'gone')).toBe(2);
    expect(await r.exec([['FLUSHALL'], ['GET', 'a']])).toEqual(['OK', null]);
    expect(r.keys()).toEqual([]);
  });
});

describe('fake-redis hashes and sets', () => {
  it('HSETNX returns 1 then 0 and never overwrites; HLEN counts; values come back as strings', async () => {
    const r = new FakeRedis();
    expect(await r.exec([['HSETNX', 'v', 'n1', 'entry-a'], ['HSETNX', 'v', 'n1', 'entry-b'], ['HSETNX', 'v', 'n2', 'entry-c'], ['HLEN', 'v'], ['HLEN', 'nope']])).toEqual([1, 0, 1, 2, 0]);
    expect(r.hash('v')).toEqual({ n1: 'entry-a', n2: 'entry-c' });
  });
  it('HGETALL is a flat field/value array (empty for a missing key)', async () => {
    const r = new FakeRedis();
    await r.exec([['HSET', 'h', 'a', 1, 'b', 'two']]);
    expect(await r.exec([['HGETALL', 'h'], ['HGETALL', 'none']])).toEqual([['a', '1', 'b', 'two'], []]);
  });
  it('HMGET returns strings and null for missing fields or a missing key (the ctl read)', async () => {
    const r = new FakeRedis();
    await r.exec([['HSET', 'ctl', 'mode', 'closed', 'unit', 4]]);
    expect(await r.exec([['HMGET', 'ctl', 'mode', 'unit', 'block'], ['HMGET', 'none', 'a', 'b']])).toEqual([['closed', '4', null], [null, null]]);
  });
  it('HSET returns the number of new fields, overwrites the rest; HDEL returns removed fields and drops an empty hash', async () => {
    const r = new FakeRedis();
    expect(await r.exec([['HSET', 'c', 'a', 1, 'b', 2], ['HSET', 'c', 'b', 3, 'z', 4], ['HDEL', 'c', 'a', 'q'], ['HMGET', 'c', 'a', 'b', 'z']])).toEqual([2, 1, 1, [null, '3', '4']]);
    expect(await r.exec([['HDEL', 'c', 'b', 'z'], ['HDEL', 'c', 'b']])).toEqual([2, 0]);
    expect(r.keys()).toEqual([]);
  });
  it('HINCRBY still works on number values and mixes with string fields from HSET', async () => {
    const r = new FakeRedis();
    await r.exec([['HSET', 'h', 'x', '7'], ['HINCRBY', 'h', 'n', 2], ['HINCRBY', 'h', 'n', 3]]);
    expect(await one(r, 'HINCRBY', 'h', 'x', 1)).toBe(8);
    expect(r.hash('h')).toEqual({ x: 8, n: 5 });
    await r.exec([['HSET', 'h', 'text', 'abc']]);
    expect(errs(r.execRaw([['HINCRBY', 'h', 'text', 1]]))).toEqual(['ERR hash value is not an integer']);
  });
  it('SADD returns added members, SREM removed ones, SMEMBERS lists them, an emptied set disappears', async () => {
    const r = new FakeRedis();
    expect(await r.exec([['SADD', 'void', 'T:20260930:a3f', '2026093014'], ['SADD', 'void', '2026093014', 'T:20260930:b20'], ['SMEMBERS', 'void'], ['SMEMBERS', 'none']]))
      .toEqual([2, 1, ['T:20260930:a3f', '2026093014', 'T:20260930:b20'], []]);
    expect(r.members('void')).toHaveLength(3);
    expect(await r.exec([['SREM', 'void', 'T:20260930:a3f', 'nope'], ['SREM', 'void', '2026093014', 'T:20260930:b20'], ['SMEMBERS', 'void']])).toEqual([1, 2, []]);
    expect(r.keys()).toEqual([]);
  });
  it('legacy list commands keep working for the old tests: LPUSH, LTRIM, LLEN', async () => {
    const r = new FakeRedis();
    expect(await r.exec([['LPUSH', 'l', 'a'], ['LPUSH', 'l', 'b'], ['LPUSH', 'l', 'c'], ['LTRIM', 'l', 0, 1], ['LLEN', 'l']])).toEqual([1, 2, 3, 'OK', 2]);
    expect(r.list('l')).toEqual(['c', 'b']);
  });
});

describe('fake-redis atomic batches', () => {
  it('a batch is applied as one unit: 50 concurrent gate batches never interleave (each sees a consistent, distinct count)', async () => {
    const r = new FakeRedis();
    const gate = (): Command[] => [['SET', 'u', 0, 'EX', 90000, 'NX'], ['INCR', 'u'], ['HSETNX', 'v', 'x', 'y'], ['INCR', 'u']];
    const replies = await Promise.all(Array.from({ length: 50 }, () => r.exec(gate())));
    const firsts = replies.map((x) => x[1] as number).sort((a, b) => a - b);
    expect(firsts).toEqual(Array.from({ length: 50 }, (_, i) => 2 * i + 1));
    replies.forEach((x) => expect((x[3] as number) - (x[1] as number)).toBe(1));
    expect(replies.filter((x) => x[0] === 'OK')).toHaveLength(1);
    expect(replies.filter((x) => x[2] === 1)).toHaveLength(1);
    expect(r.counter('u')).toBe(100);
  });
  it('a runtime error in one command does not stop the others (Redis EXEC): execRaw shows both, exec applies then throws a scrubbed error', async () => {
    const r = new FakeRedis();
    await r.exec([['HSET', 'h', 'f', 1]]);
    const raw = r.execRaw([['SET', 'ok1', 1], ['INCR', 'h'], ['SET', 'ok2', 2]]);
    expect(raw).toEqual([{ result: 'OK' }, { error: 'WRONGTYPE Operation against a key holding the wrong kind of value' }, { result: 'OK' }]);
    await expect(r.exec([['SET', 'ok3', 3], ['GET', 'h'], ['SET', 'ok4', 4]])).rejects.toThrow('vote store command failed');
    expect(r.keys().sort()).toEqual(['h', 'ok1', 'ok2', 'ok3', 'ok4']);
  });
});

describe('fake-redis Redis-like errors', () => {
  const cases: [string, Command, string][] = [
    ['wrong type on GET of a hash', ['GET', 'h'], 'WRONGTYPE'],
    ['wrong type on HLEN of a string', ['HLEN', 's'], 'WRONGTYPE'],
    ['wrong type on HSETNX of a set', ['HSETNX', 'set', 'a', 'b'], 'WRONGTYPE'],
    ['wrong type on SADD to a string', ['SADD', 's', 'm'], 'WRONGTYPE'],
    ['wrong type on SMEMBERS of a hash', ['SMEMBERS', 'h'], 'WRONGTYPE'],
    ['wrong type on HGETALL of a set', ['HGETALL', 'set'], 'WRONGTYPE'],
    ['wrong type on INCR of a hash', ['INCR', 'h'], 'WRONGTYPE'],
    ['arity: SET with no value', ['SET', 'k'], "ERR wrong number of arguments for 'set' command"],
    ['arity: HMGET with no field', ['HMGET', 'h'], "ERR wrong number of arguments for 'hmget' command"],
    ['arity: HSETNX with no value', ['HSETNX', 'h', 'f'], "ERR wrong number of arguments for 'hsetnx' command"],
    ['arity: HLEN with an extra argument', ['HLEN', 'h', 'x'], "ERR wrong number of arguments for 'hlen' command"],
    ['arity: HSET with an unpaired field', ['HSET', 'h', 'a', 1, 'b'], "ERR wrong number of arguments for 'hset' command"],
    ['arity: FLUSHALL with an argument', ['FLUSHALL', 'now'], "ERR wrong number of arguments for 'flushall' command"],
    ['syntax: unknown SET option', ['SET', 'k', 1, 'XX'], 'ERR syntax error'],
    ['syntax: EX without a value', ['SET', 'k', 1, 'EX'], 'ERR syntax error'],
    ['bad expire: EX 0', ['SET', 'k', 1, 'EX', 0], "ERR invalid expire time in 'set' command"],
    ['bad expire: EX text', ['SET', 'k', 1, 'EX', 'soon'], "ERR invalid expire time in 'set' command"],
    ['EXPIRE with text', ['EXPIRE', 's', 'soon'], 'ERR value is not an integer or out of range'],
    ['unknown command', ['EVAL', 'return 1', 0], "ERR unknown command 'eval'"],
  ];
  it.each(cases)('%s', (_n, cmd, want) => {
    const r = new FakeRedis();
    r.execRaw([['HSET', 'h', 'f', 'v'], ['SET', 's', 'v'], ['SADD', 'set', 'm']]);
    const [e] = errs(r.execRaw([cmd]));
    expect(e).not.toBeNull();
    expect(e!.startsWith(want)).toBe(true);
  });
  it('a failed command leaves the key untouched (no partial write)', async () => {
    const r = new FakeRedis();
    r.execRaw([['SET', 'k', 'keep'], ['SET', 'k', 'new', 'EX', 0], ['SET', 'k', 'new', 'BOGUS']]);
    expect(await one(r, 'GET', 'k')).toBe('keep');
  });
  it('commands are case-insensitive, like Redis', async () => {
    const r = new FakeRedis();
    expect(await r.exec([['set', 'k', 1, 'ex', 5, 'nx'], ['incr', 'n'], ['hSetNx', 'h', 'f', 'v']])).toEqual(['OK', 1, 1]);
  });
});

describe('fake-redis failure hooks and counters', () => {
  it('failWith throws before applying anything but still counts the call and the commands', async () => {
    const r = new FakeRedis();
    r.failWith = new Error('boom');
    await expect(r.exec([['SET', 'k', 1], ['INCR', 'k']])).rejects.toThrow('boom');
    expect(r.keys()).toEqual([]);
    expect([r.execCalls, r.commands, r.log.length]).toEqual([1, 2, 2]);
    r.failWith = null;
    expect(await one(r, 'GET', 'k')).toBeNull();
  });
  it('failAfterApply applies the matching batch, then throws a timeout error; other batches are untouched; null clears it', async () => {
    const r = new FakeRedis();
    r.failAfterApply((cmds) => cmds.some((c) => c[0] === 'HSETNX'));
    await expect(r.exec([['HSETNX', 'v', 'n', 'e']])).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(r.hash('v')).toEqual({ n: 'e' });
    expect(await one(r, 'SET', 'other', 1)).toBe('OK');
    await expect(r.exec([['HSETNX', 'v', 'n', 'again']])).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(r.hash('v')).toEqual({ n: 'e' });
    r.failAfterApply(null);
    expect(await one(r, 'HSETNX', 'v', 'n', 'again')).toBe(0);
    expect(r.execCalls).toBe(4);
  });
  it('failAfterApply with no argument matches every batch', async () => {
    const r = new FakeRedis();
    r.failAfterApply();
    await expect(one(r, 'SET', 'k', 1)).rejects.toThrow('timeout');
    expect(r.counter('k')).toBe(1);
  });
  it('hang() never answers, and applies nothing; with timeoutMs it rejects with a TimeoutError after that long; hang(false) recovers', async () => {
    vi.useFakeTimers();
    const r = new FakeRedis();
    r.hang();
    let settled = false;
    const silent = r.exec([['SET', 'k', 1]]).finally(() => { settled = true; });
    silent.catch(() => {});
    const timed = r.exec([['SET', 'k', 2]], { timeoutMs: 2000 });
    const caught = expect(timed).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await caught;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    expect(r.keys()).toEqual([]);
    expect(r.execCalls).toBe(2);
    r.hang(false);
    expect(await one(r, 'SET', 'k', 3)).toBe('OK');
  });
  it('admin() runs an owner console command without counting or logging it, and throws on a Redis error', async () => {
    const r = new FakeRedis();
    expect(r.admin(['SADD', 'void', 'H'])).toBe(1);
    expect(r.admin(['HSET', 'ctl', 'mode', 'closed'])).toBe(1);
    expect([r.execCalls, r.commands, r.log.length]).toEqual([0, 0, 0]);
    expect(r.members('void')).toEqual(['H']);
    expect(() => r.admin(['GET', 'ctl'])).toThrow('WRONGTYPE');
  });
  it('helpers read live state only: hash, members, counter, keys ignore expired keys', async () => {
    const { r, tick } = clocked();
    await r.exec([['HSET', 'h', 'a', 1], ['SADD', 's', 'x'], ['SET', 'c', 4, 'EX', 5], ['SET', 'ex', 'v', 'EX', 1], ['HSET', 'exh', 'a', 1], ['EXPIRE', 'exh', 1]]);
    tick(2_000);
    expect(r.keys().sort()).toEqual(['c', 'h', 's']);
    expect([r.hash('h'), r.hash('exh'), r.members('s'), r.counter('c')]).toEqual([{ a: '1' }, {}, ['x'], 4]);
    tick(4_000);
    expect(r.counter('c')).toBe(0);
  });
});

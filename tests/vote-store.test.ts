import { describe, expect, it } from 'vitest';
import { createUpstashStore, STORE_TIMEOUT_MS, storeFromEnv } from '@/server/vote/store';
import { ipKey, ipNetwork } from '@/server/vote/hash';
import { MEMO_CAP, MemoLimit } from '@/server/vote/memoLimit';
import { depsFromEnv } from '@/server/vote/handlers';

type Call = { url: string; init: RequestInit };
function mockFetch(reply: unknown, status = 200) {
  const calls: Call[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
  };
  return { f, calls };
}

describe('Upstash store', () => {
  it('POSTs the commands to /multi-exec with a Bearer token and returns each result', async () => {
    const { f, calls } = mockFetch([{ result: 'OK' }, { result: 3 }]);
    const store = createUpstashStore('https://example-db.upstash.io/', 'tok-123', f);
    const out = await store.exec([['SET', 'k', 0, 'EX', 3600, 'NX'], ['INCR', 'k']]);
    expect(out).toEqual(['OK', 3]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://example-db.upstash.io/multi-exec');
    expect(calls[0].init.method).toBe('POST');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(calls[0].init.body))).toEqual([['SET', 'k', 0, 'EX', 3600, 'NX'], ['INCR', 'k']]);
  });

  it('gives up on a hung store after its timeout (under the client 6 s), without leaking the token', async () => {
    let signal: AbortSignal | undefined;
    const hang = (_: string, init: RequestInit) => { signal = init.signal ?? undefined; return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))); };
    const store = createUpstashStore('https://x.upstash.io', 'tok-secret', hang, 30);
    const err = await store.exec([['INCR', 'a']]).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error); expect(String(err)).not.toContain('tok-secret');
    expect(signal?.aborted).toBe(true);
    expect(STORE_TIMEOUT_MS).toBeLessThan(6000);
  });

  it('throws on an error entry or a non-2xx status, without leaking the token', async () => {
    const bad = createUpstashStore('https://x.upstash.io', 'tok-secret', mockFetch([{ result: 1 }, { error: 'WRONGTYPE' }]).f);
    await expect(bad.exec([['INCR', 'a'], ['HINCRBY', 'a', 'f', 1]])).rejects.toThrow();
    const down = createUpstashStore('https://x.upstash.io', 'tok-secret', mockFetch({ error: 'unauthorized' }, 401).f);
    const err = await down.exec([['INCR', 'a']]).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).not.toContain('tok-secret');
    const weird = createUpstashStore('https://x.upstash.io', 't', mockFetch({ result: 1 }).f);
    await expect(weird.exec([['INCR', 'a']])).rejects.toThrow();
  });

  it('storeFromEnv prefers UPSTASH_* over KV_* and needs both values', async () => {
    const { f, calls } = mockFetch([{ result: 1 }]);
    const both = { UPSTASH_REDIS_REST_URL: 'https://u.io', UPSTASH_REDIS_REST_TOKEN: 'ut', KV_REST_API_URL: 'https://kv.io', KV_REST_API_TOKEN: 'kt' };
    await storeFromEnv(both, f)!.exec([['INCR', 'a']]);
    expect(calls[0].url).toBe('https://u.io/multi-exec');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer ut');
    await storeFromEnv({ KV_REST_API_URL: 'https://kv.io', KV_REST_API_TOKEN: 'kt' }, f)!.exec([['INCR', 'a']]);
    expect(calls[1].url).toBe('https://kv.io/multi-exec');
    expect(storeFromEnv({})).toBeNull();
    expect(storeFromEnv({ UPSTASH_REDIS_REST_URL: 'https://u.io' })).toBeNull();
    expect(storeFromEnv({ KV_REST_API_TOKEN: 'kt' })).toBeNull();
  });

  it('depsFromEnv names the namespace by VERCEL_ENV and salts with VOTE_SALT, else the token', () => {
    const env = { KV_REST_API_URL: 'https://kv.io', KV_REST_API_TOKEN: 'kt' };
    expect(depsFromEnv(env).ns).toBe('hv:local');
    expect(depsFromEnv({ ...env, VERCEL_ENV: 'production' }).ns).toBe('hv:production');
    expect(depsFromEnv(env).salt).toBe('kt');
    expect(depsFromEnv({ ...env, VOTE_SALT: 's' }).salt).toBe('s');
    expect(depsFromEnv({}).store).toBeNull();
    expect(depsFromEnv(env).memo).toBe(depsFromEnv({}).memo);
    expect(depsFromEnv({}).serverBuild.length).toBeGreaterThan(0);
  });
});

describe('ipKey', () => {
  const day1 = Date.UTC(2026, 8, 25, 1);
  const day1Late = Date.UTC(2026, 8, 25, 23, 59);
  const day2 = Date.UTC(2026, 8, 26, 0, 1);
  it('is deterministic within a UTC day and changes across days and salts', () => {
    const k = ipKey('203.0.113.9', 'salt', day1);
    expect(k).toMatch(/^[0-9a-f]{24}$/);
    expect(ipKey('203.0.113.9', 'salt', day1Late)).toBe(k);
    expect(ipKey('203.0.113.9', 'salt', day2)).not.toBe(k);
    expect(ipKey('203.0.113.9', 'pepper', day1)).not.toBe(k);
    expect(ipKey('203.0.113.10', 'salt', day1)).not.toBe(k);
    expect(k).not.toContain('203');
  });
  it('keys IPv6 by its /64, so one home or VPS network cannot mint a fresh key per request (review 2026-09-25)', () => {
    const a = ipKey('2001:db8:85a3:12::1', 'salt', day1);
    expect(ipKey('2001:db8:85a3:12:ffff:ffff:ffff:fffe', 'salt', day1)).toBe(a);
    expect(ipKey('2001:0DB8:85A3:0012:0:0:0:9', 'salt', day1)).toBe(a); // case and leading zeros
    expect(ipKey('[2001:db8:85a3:12::7]', 'salt', day1)).toBe(a);
    expect(ipKey('fe80::1%eth0', 'salt', day1)).toBe(ipKey('fe80::2', 'salt', day1));
    expect(ipKey('2001:db8:85a3:13::1', 'salt', day1)).not.toBe(a); // the next /64 is another network
  });
  it('reads networks: IPv4 as is, IPv6 as its /64, mapped IPv4 as IPv4, junk as given', () => {
    expect(ipNetwork('203.0.113.9')).toBe('203.0.113.9');
    expect(ipNetwork('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipNetwork('::1')).toBe('0:0:0:0::/64');
    expect(ipNetwork('::')).toBe('0:0:0:0::/64');
    expect(ipNetwork('1:2:3:4:5:6:7:8')).toBe('1:2:3:4::/64');
    expect(ipNetwork('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(ipNetwork('::FFFF:cb00:7109')).toBe('203.0.113.9');
    expect(ipNetwork('64:ff9b::203.0.113.9')).toBe('64:ff9b:0:0::/64');
    for (const bad of ['unknown', '1::2::3', '1:2:3', 'zz::1', '::ffff:300.1.1.1', '1:2:3:4:5:6:7:8:9']) expect(ipNetwork(bad)).toBe(bad);
  });
});

describe('MemoLimit', () => {
  it('trips after the limit and resets on a new hour', () => {
    const m = new MemoLimit();
    for (let i = 0; i < 20; i++) expect(m.over('a', 100, 20)).toBe(false);
    expect(m.over('a', 100, 20)).toBe(true);
    expect(m.over('b', 100, 20)).toBe(false);
    expect(m.over('a', 101, 20)).toBe(false);
  });

  it('caps at 1000 entries, dropping the oldest', () => {
    const m = new MemoLimit();
    for (let i = 0; i < 20; i++) m.over('first', 1, 20);
    for (let i = 0; i < MEMO_CAP + 50; i++) m.over(`k${i}`, 1, 20);
    expect(m.size).toBe(MEMO_CAP);
    // 'first' was dropped, so it starts counting again from 1.
    expect(m.over('first', 1, 20)).toBe(false);
  });
});

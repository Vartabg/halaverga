import { describe, expect, it } from 'vitest';
import { createUpstashStore, envCredentials, STORE_TIMEOUT_MS, storeFromEnv } from '@/server/vote/store';

type Call = { url: string; init: RequestInit };
function mockFetch(reply: unknown, status = 200) {
  const calls: Call[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
  };
  return { f, calls };
}
/** A fetch that never answers and rejects the moment its signal aborts, like a real one. */
const hang = (seen: { signal?: AbortSignal } = {}) => (_: string, init: RequestInit) => {
  seen.signal = init.signal ?? undefined;
  return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
};

describe('Upstash store', () => {
  it('POSTs the commands to /multi-exec with a Bearer token and returns each result', async () => {
    const { f, calls } = mockFetch([{ result: 'OK' }, { result: 3 }]);
    const store = createUpstashStore('https://example-db.upstash.io/', 'tok-123', f);
    expect(await store.exec([['SET', 'k', 0, 'EX', 3600, 'NX'], ['INCR', 'k']])).toEqual(['OK', 3]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://example-db.upstash.io/multi-exec');
    expect(calls[0].init.method).toBe('POST');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(calls[0].init.body))).toEqual([['SET', 'k', 0, 'EX', 3600, 'NX'], ['INCR', 'k']]);
  });

  it('pins the round trip at 2 s, well under the 6 s handler deadline and the client attempt', () => {
    expect(STORE_TIMEOUT_MS).toBe(2000);
  });

  it('gives up on a hung store after its timeout, without leaking the token', async () => {
    const seen: { signal?: AbortSignal } = {};
    const store = createUpstashStore('https://x.upstash.io', 'tok-secret', hang(seen), 30);
    const err = await store.exec([['INCR', 'a']]).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).not.toContain('tok-secret');
    expect(seen.signal?.aborted).toBe(true);
  });

  it('a per-call timeoutMs (the handler passes what is left of its deadline) replaces the default for that call only', async () => {
    const store = createUpstashStore('https://x.upstash.io', 't', hang(), 5000);
    const t0 = Date.now();
    await expect(store.exec([['INCR', 'a']], { timeoutMs: 25 })).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(1000);
    const seen: { signal?: AbortSignal } = {};
    const slow = createUpstashStore('https://x.upstash.io', 't', hang(seen), 30);
    const p = slow.exec([['INCR', 'a']], { timeoutMs: 5000 }).catch(() => 'late');
    await new Promise((r) => setTimeout(r, 120));
    expect(seen.signal?.aborted).toBe(false); // the longer per-call value won over the 30 ms default
    seen.signal?.dispatchEvent(new Event('abort'));
    expect(await p).toBe('late');
  });

  it('throws on an error entry, a non-2xx status or a non-array reply, without leaking the token', async () => {
    const bad = createUpstashStore('https://x.upstash.io', 'tok-secret', mockFetch([{ result: 1 }, { error: 'WRONGTYPE' }]).f);
    await expect(bad.exec([['INCR', 'a'], ['HINCRBY', 'a', 'f', 1]])).rejects.toThrow();
    const down = createUpstashStore('https://x.upstash.io', 'tok-secret', mockFetch({ error: 'unauthorized' }, 401).f);
    const err = await down.exec([['INCR', 'a']]).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain('tok-secret');
    await expect(createUpstashStore('https://x.upstash.io', 't', mockFetch({ result: 1 }).f).exec([['INCR', 'a']])).rejects.toThrow();
  });
});

describe('storeFromEnv: the one place a backend is chosen', () => {
  const both = { UPSTASH_REDIS_REST_URL: 'https://u.io', UPSTASH_REDIS_REST_TOKEN: 'ut', KV_REST_API_URL: 'https://kv.io', KV_REST_API_TOKEN: 'kt' };

  it('prefers UPSTASH_* over KV_* and needs both values', async () => {
    const { f, calls } = mockFetch([{ result: 1 }]);
    await storeFromEnv(both, f)!.exec([['INCR', 'a']]);
    expect(calls[0].url).toBe('https://u.io/multi-exec');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer ut');
    await storeFromEnv({ KV_REST_API_URL: 'https://kv.io', KV_REST_API_TOKEN: 'kt' }, f)!.exec([['INCR', 'a']]);
    expect(calls[1].url).toBe('https://kv.io/multi-exec');
    expect(envCredentials({ UPSTASH_REDIS_REST_URL: 'https://u.io' })).toBeNull();
    for (const env of [{}, { UPSTASH_REDIS_REST_URL: 'https://u.io' }, { KV_REST_API_TOKEN: 'kt' }]) expect(storeFromEnv(env)).toBeNull();
  });

  it('W5 a production URL that is not https gives no store; a local http URL is fine off production', () => {
    expect(storeFromEnv({ ...both, VERCEL_ENV: 'production', UPSTASH_REDIS_REST_URL: 'http://u.io' })).toBeNull();
    expect(storeFromEnv({ ...both, VERCEL_ENV: 'production' })).not.toBeNull();
    expect(storeFromEnv({ UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:3402', UPSTASH_REDIS_REST_TOKEN: 'dev' })).not.toBeNull();
  });
});

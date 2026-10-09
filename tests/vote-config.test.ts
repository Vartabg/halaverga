import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depsFromEnv, MIN_SALT_LENGTH } from '@/server/vote/config';
import { Latch, MemoLimit } from '@/server/vote/memo';

const SALT = 's'.repeat(MIN_SALT_LENGTH);
const KV = { KV_REST_API_URL: 'https://kv.io', KV_REST_API_TOKEN: 'kt' };
const good = { ...KV, VOTE_SALT: SALT };
afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

describe('depsFromEnv', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });

  it('names the namespace by VERCEL_ENV, local when it is unset', () => {
    expect(depsFromEnv(good).ns).toBe('hv:local');
    expect(depsFromEnv({ ...good, VERCEL_ENV: 'production' }).ns).toBe('hv:production');
    expect(depsFromEnv({ ...good, VERCEL_ENV: 'development' }).ns).toBe('hv:development');
  });

  it('needs the salt, at least 32 characters, and never falls back to the store token (PRIV-1)', () => {
    expect(depsFromEnv(good).store).not.toBeNull();
    expect(depsFromEnv({ ...good, VOTE_SALT: 's'.repeat(MIN_SALT_LENGTH - 1) }).store).toBeNull();
    expect(depsFromEnv(KV).store).toBeNull();
    expect(depsFromEnv({ ...KV, VOTE_SALT: '' }).store).toBeNull();
    expect(depsFromEnv({ ...KV, VOTE_SALT: 'kt'.repeat(MIN_SALT_LENGTH) }).salt).toBe('kt'.repeat(MIN_SALT_LENGTH));
    expect(depsFromEnv({ VOTE_SALT: SALT }).store).toBeNull();
    expect(depsFromEnv({}).store).toBeNull();
  });

  it('keeps a preview deployment off the production store unless VOTE_ALLOW_PREVIEW is exactly 1 (W5)', () => {
    const preview = { ...good, VERCEL_ENV: 'preview' };
    expect(depsFromEnv(preview).store).toBeNull();
    for (const v of ['0', 'true', 'yes', '']) expect(depsFromEnv({ ...preview, VOTE_ALLOW_PREVIEW: v }).store).toBeNull();
    expect(depsFromEnv({ ...preview, VOTE_ALLOW_PREVIEW: '1' }).store).not.toBeNull();
    expect(depsFromEnv({ ...good, VERCEL_ENV: 'development' }).store).not.toBeNull();
  });

  it('gives no store for a production URL that is not https, whatever the salt (W5)', () => {
    expect(depsFromEnv({ ...good, VERCEL_ENV: 'production', KV_REST_API_URL: 'http://kv.io' }).store).toBeNull();
    expect(depsFromEnv({ ...good, VERCEL_ENV: 'production' }).store).not.toBeNull();
  });

  it('takes onVercel only from VERCEL exactly 1, and the clock from Date.now', () => {
    expect(depsFromEnv(good).onVercel).toBe(false);
    expect(depsFromEnv({ ...good, VERCEL: '1' }).onVercel).toBe(true);
    expect(depsFromEnv({ ...good, VERCEL: 'true' }).onVercel).toBe(false);
    expect(depsFromEnv(good).now).toBe(Date.now);
  });

  it('shares one memo and one latch per process, across calls and environments', () => {
    const a = depsFromEnv(good), b = depsFromEnv({});
    expect(a.memo).toBe(b.memo);
    expect(a.latch).toBe(b.latch);
    expect(a.memo).toBeInstanceOf(MemoLimit);
    expect(a.latch).toBeInstanceOf(Latch);
  });

  it('passes the injected fetch to the store it builds', async () => {
    const f = vi.fn(async () => new Response('[{"result":1}]'));
    await depsFromEnv(good, f).store!.exec([['INCR', 'a']]);
    expect(f).toHaveBeenCalledOnce();
  });
});

describe('the cold-start log line', () => {
  const line = async (env: Record<string, string | undefined>) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { depsFromEnv: fresh } = await import('@/server/vote/config');
    fresh(env);
    fresh(env);
    return log.mock.calls;
  };

  it('is one line per process, words only', async () => {
    const calls = await line({ ...good, VERCEL_ENV: 'production' });
    expect(calls).toEqual([['[vote] config store=ok salt=ok env=production']]);
  });

  it('says what is missing without printing a value', async () => {
    expect(await line({ KV_REST_API_URL: 'https://secret-host.io', KV_REST_API_TOKEN: 'secret-token' })).toEqual([['[vote] config store=missing salt=missing env=unset']]);
    vi.resetModules();
    expect(await line({ ...KV, VOTE_SALT: 'short-secret' })).toEqual([['[vote] config store=missing salt=short env=unset']]);
    vi.resetModules();
    expect(await line({ ...good, VERCEL_ENV: 'weird-name' })).toEqual([['[vote] config store=ok salt=ok env=other']]);
  });
});

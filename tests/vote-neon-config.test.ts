import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depsFromEnv, MIN_SALT_LENGTH } from '@/server/vote/config';
import { CS, PW, HOST, USER } from './helpers/neonKit';

const SALT = 's'.repeat(MIN_SALT_LENGTH);
const NEON = { DATABASE_URL: CS, VOTE_SALT: SALT };
afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

describe('depsFromEnv with a Neon connection string', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });

  it('only a valid DATABASE_URL gives a store, in production too', () => {
    expect(depsFromEnv(NEON).store).not.toBeNull();
    expect(depsFromEnv({ ...NEON, VERCEL_ENV: 'production' }).store).not.toBeNull();
    expect(depsFromEnv({ ...NEON, VERCEL_ENV: 'production' }).ns).toBe('hv:production');
    expect(depsFromEnv({ ...NEON, DATABASE_URL: 'nope' }).store).toBeNull();
    expect(depsFromEnv({ VOTE_SALT: SALT }).store).toBeNull();
  });

  it('preview stays closed without VOTE_ALLOW_PREVIEW=1, exactly as for Upstash (the integration connects preview by default)', () => {
    const preview = { ...NEON, VERCEL_ENV: 'preview' };
    expect(depsFromEnv(preview).store).toBeNull();
    for (const v of ['0', 'true', '']) expect(depsFromEnv({ ...preview, VOTE_ALLOW_PREVIEW: v }).store).toBeNull();
    expect(depsFromEnv({ ...preview, VOTE_ALLOW_PREVIEW: '1' }).store).not.toBeNull();
  });

  it('an http Upstash pair plus a valid DATABASE_URL in production is closed: the misconfigured winner is loud, never a silent switch', () => {
    const env = { ...NEON, VERCEL_ENV: 'production', UPSTASH_REDIS_REST_URL: 'http://u.io', UPSTASH_REDIS_REST_TOKEN: 'ut' };
    expect(depsFromEnv(env).store).toBeNull();
  });

  it('the salt stays required and separate from the database string: missing or short is closed, and it never falls back to the password', () => {
    expect(depsFromEnv({ DATABASE_URL: CS }).store).toBeNull();
    expect(depsFromEnv({ ...NEON, VOTE_SALT: 's'.repeat(MIN_SALT_LENGTH - 1) }).store).toBeNull();
    expect(depsFromEnv({ DATABASE_URL: CS, VOTE_SALT: PW.repeat(4) }).salt).toBe(PW.repeat(4));
  });

  it('the one cold-start log line is words only: it says store=ok and nothing of the string', async () => {
    const { depsFromEnv: fresh } = await import('@/server/vote/config');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    fresh({ ...NEON, VERCEL_ENV: 'production' });
    fresh({ ...NEON, VERCEL_ENV: 'production' });
    expect(log.mock.calls).toEqual([['[vote] config store=ok salt=ok env=production']]);
    for (const m of [PW, USER, HOST, CS]) expect(JSON.stringify(log.mock.calls)).not.toContain(m);
  });
});

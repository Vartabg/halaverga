import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseNeonUrl } from '@/server/vote/neonConn';
import { selectBackend, storeFromEnv, type FetchLike } from '@/server/vote/store';
import { CS, HOST } from './helpers/neonKit';

const POOLED = 'postgresql://app_owner:pw%40x@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const UNPOOLED = 'postgresql://app_owner:pw@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require';
const UP = { UPSTASH_REDIS_REST_URL: 'https://u.io', UPSTASH_REDIS_REST_TOKEN: 'ut' };
const KV = { KV_REST_API_URL: 'https://kv.io', KV_REST_API_TOKEN: 'kt' };

describe('parseNeonUrl', () => {
  it('derives https://<lowercased host>/sql and returns the string unchanged (query parameters included)', () => {
    expect(parseNeonUrl(POOLED)).toEqual({ endpoint: 'https://ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/sql', connectionString: POOLED });
    expect(parseNeonUrl(UNPOOLED)?.endpoint).toBe('https://ep-cool-name-123456.us-east-2.aws.neon.tech/sql');
    expect(parseNeonUrl('postgres://u:p@EP-Mixed.Neon.TECH:6543/db')?.endpoint).toBe('https://ep-mixed.neon.tech/sql');
    expect(parseNeonUrl('postgresql://u:p%23%3F@h.neon.tech/db')?.endpoint).toBe('https://h.neon.tech/sql');
  });
  it('CODE-10 only a Neon host is accepted: *.neon.tech, never another host, an IP or a look-alike', () => {
    for (const host of ['db.example.com', 'ep-x.neon.tech.evil.io', 'neon.tech', 'evilneon.tech', 'ep-x.neon.techx', '1.2.3.4', 'ep-x.neon.tech-evil.com', 'localhost', '127.0.0.1', 'ep-x.neon.tec', 'x.supabase.co']) {
      expect(parseNeonUrl(`postgresql://u:p@${host}/db`), host).toBeNull();
    }
    expect(parseNeonUrl('postgresql://u:p@ep-x.us-east-2.aws.neon.tech/db')).not.toBeNull();
    expect(selectBackend({ DATABASE_URL: 'postgresql://u:p@db.example.com/db' })).toBeNull();
    expect(selectBackend({ POSTGRES_URL: 'postgresql://u:p@db.example.com/db' })).toBeNull();
  });
  it('CODE-10 localhost and 127.0.0.1 pass only through the injected allowLocal option, which nothing in the app passes', () => {
    for (const host of ['localhost', '127.0.0.1']) {
      expect(parseNeonUrl(`postgresql://u:p@${host}/db`)).toBeNull();
      expect(parseNeonUrl(`postgresql://u:p@${host}:5432/db`, { allowLocal: true })?.endpoint).toBe(`https://${host}/sql`);
    }
    expect(parseNeonUrl('postgresql://u:p@db.example.com/db', { allowLocal: true })).toBeNull(); // the option opens only the two local names
    for (const file of ['store.ts', 'config.ts', 'neonStore.ts']) expect(readFileSync(fileURLToPath(new URL(`../src/server/vote/${file}`, import.meta.url)), 'utf8')).not.toMatch(/allowLocal:\s*true/);
  });
  it('is null, and never throws, for anything unusable', () => {
    const bad = ['', ' ', 'x'.repeat(30), 'postgresql://user:pass@host.neon.tech', 'postgresql://user:pass@host.neon.tech/', 'postgresql://user@host.neon.tech/db', 'postgresql://:pass@host.neon.tech/db',
      'postgresql://user:@host.neon.tech/db', 'postgresql://us er:pass@host.neon.tech/db', 'postgresql://user:pass@host.neon.tech/db\n', 'postgresql://user:pass@host.neon.tech/db\u0000',
      'http://user:pass@host.neon.tech/db', 'https://user:pass@host.neon.tech/db', 'mysql://user:pass@host.neon.tech/db', 'postgresql://user:pass@[::1]/db',
      'postgresql://user:pass@localhost/db', `postgresql://user:pass@host.neon.tech/${'d'.repeat(2100)}`, 'postgresql://user:pass@ho_st.neon.tech/db', 'postgresql://user:pass@-host.neon.tech/db', 'postgresql://user:pass@host.neon.tech.:5432/db', '//user:pass@host.neon.tech/db'];
    for (const s of bad) expect(parseNeonUrl(s), JSON.stringify(s.slice(0, 60))).toBeNull();
    for (const s of [undefined, null, 5, {}] as unknown as string[]) expect(parseNeonUrl(s)).toBeNull();
  });
});

describe('selectBackend: Upstash wins, then Neon, else closed', () => {
  it('an Upstash pair wins, even when a Neon string is also present, under either name', () => {
    expect(selectBackend({ ...UP, DATABASE_URL: POOLED })).toEqual({ kind: 'upstash', url: 'https://u.io', token: 'ut' });
    expect(selectBackend({ ...KV, DATABASE_URL: POOLED })).toEqual({ kind: 'upstash', url: 'https://kv.io', token: 'kt' });
    expect(selectBackend({ ...KV, ...UP })).toMatchObject({ url: 'https://u.io' });
  });
  it('half a pair counts as absent and falls to Neon; with no Neon string it is closed', () => {
    for (const half of [{ UPSTASH_REDIS_REST_URL: 'https://u.io' }, { KV_REST_API_TOKEN: 'kt' }]) {
      expect(selectBackend({ ...half, DATABASE_URL: POOLED })).toEqual({ kind: 'neon', connectionString: POOLED });
      expect(selectBackend(half)).toBeNull();
    }
  });
  it('DATABASE_URL beats POSTGRES_URL; POSTGRES_URL is used when DATABASE_URL is empty; the string is trimmed', () => {
    expect(selectBackend({ DATABASE_URL: POOLED, POSTGRES_URL: UNPOOLED })).toEqual({ kind: 'neon', connectionString: POOLED });
    expect(selectBackend({ POSTGRES_URL: UNPOOLED })).toEqual({ kind: 'neon', connectionString: UNPOOLED });
    expect(selectBackend({ DATABASE_URL: '', POSTGRES_URL: UNPOOLED })).toEqual({ kind: 'neon', connectionString: UNPOOLED });
    expect(selectBackend({ DATABASE_URL: `  ${POOLED}\n` })).toEqual({ kind: 'neon', connectionString: POOLED });
  });
  it('an unparsable DATABASE_URL closes the vote: no fall-through to POSTGRES_URL and no exception', () => {
    expect(selectBackend({ DATABASE_URL: 'not a url', POSTGRES_URL: POOLED })).toBeNull();
    expect(selectBackend({ DATABASE_URL: 'https://x.neon.tech/db', POSTGRES_URL: POOLED })).toBeNull();
  });
  it('only the two documented names are read', () => {
    for (const name of ['DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL', 'NEON_DATABASE_URL', 'NEON2_DATABASE_URL', 'PGHOST']) expect(selectBackend({ [name]: POOLED }), name).toBeNull();
    expect(selectBackend({})).toBeNull();
  });
});

describe('storeFromEnv picks the adapter by the URL its fetch receives', () => {
  const spy = () => { const urls: { url: string; init: RequestInit }[] = []; const f: FetchLike = async (url, init) => { urls.push({ url, init }); return new Response(JSON.stringify(url.endsWith('/sql') ? { results: [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [['1']] }, { rows: [] }] } : [{ result: 1 }]), { status: 200 }); }; return { f, urls }; };
  it('Upstash: /multi-exec with a Bearer token, unchanged; Neon: /sql with the connection-string header', async () => {
    const a = spy();
    const upstash = storeFromEnv({ ...UP, DATABASE_URL: POOLED }, a.f)!;
    expect(await upstash.exec([['INCR', 'a']])).toEqual([1]);
    expect(a.urls[0].url).toBe('https://u.io/multi-exec');
    expect((a.urls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer ut');
    expect(JSON.parse(String(a.urls[0].init.body))).toEqual([['INCR', 'a']]);
    expect(upstash.callBudgetMs).toBeUndefined();
    const b = spy();
    const neon = storeFromEnv({ DATABASE_URL: POOLED }, b.f)!;
    expect(await neon.exec([['INCR', 'a']])).toEqual([1]);
    expect(b.urls[0].url).toBe('https://ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/sql');
    expect((b.urls[0].init.headers as Record<string, string>)['Neon-Connection-String']).toBe(POOLED);
    expect(neon.callBudgetMs).toBe(3000);
  });
  it('production: a Neon string is fine (its transport is always https); an http Upstash pair is null, and it wins over Neon', () => {
    expect(storeFromEnv({ VERCEL_ENV: 'production', DATABASE_URL: CS })).not.toBeNull();
    expect(storeFromEnv({ VERCEL_ENV: 'production', UPSTASH_REDIS_REST_URL: 'http://u.io', UPSTASH_REDIS_REST_TOKEN: 'ut', DATABASE_URL: CS })).toBeNull();
    expect(storeFromEnv({ VERCEL_ENV: 'production', ...UP })).not.toBeNull();
    expect(storeFromEnv({ VERCEL_ENV: 'production', DATABASE_URL: CS.replace(HOST, 'h') })).toBeNull(); // a host without a dot
  });
  it('an empty environment gives no store', () => { expect(storeFromEnv({})).toBeNull(); });
});

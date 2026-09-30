import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNeonStore } from '@/server/vote/neonStore';
import { CTL_FIELDS } from '@/server/vote/limits';
import { runbook } from '@/server/vote/neonRunbook';
import type { Command } from '@/server/vote/store';
import { FakeRedis } from '../fixtures/fake-redis';
import { CS } from '../helpers/neonKit';
import { hasPg, startPg, type Pg } from '../helpers/pgHttp';

// Each runbook line: the Redis command on FakeRedis and the SQL on a real PostgreSQL leave the same state, read back through the real
// commands (HMGET ctl, SMEMBERS void, HLEN and HGETALL vote), and each SQL statement runs as one statement without error.
const NS = 'hv:production';
const items = runbook(NS);
const id = (x: string) => items.find((i) => i.id === x)!;

describe('the runbook text', () => {
  it('names every operation the owner needs, with the SQL in one statement each', () => {
    expect(items.map((i) => i.id)).toEqual(['close', 'reopen', 'shield', 'share-day', 'cap', 'minv', 'max', 'clear-knobs', 'show-knobs', 'void-group', 'void-group-hour', 'void-hour', 'unvoid', 'list-voids', 'count', 'reset-poll', 'counted-today', 'audit-day-group', 'audit-hour']);
    for (const i of items) { expect(i.sql.trim().endsWith(';'), i.id).toBe(true); expect(i.sql.trim().slice(0, -1).includes(';'), i.id).toBe(false); }
    expect(id('close').sql).toBe("INSERT INTO public.hv_hash (k, field, value) VALUES ('hv:production:ctl','mode','closed') ON CONFLICT (k, field) DO UPDATE SET value = EXCLUDED.value;");
    expect(id('reopen').sql).toBe("DELETE FROM public.hv_hash WHERE k = 'hv:production:ctl' AND field = 'mode';");
  });
  it('refuses a namespace, day, hour or group that is not plain', () => {
    for (const ns of ["hv:x'; DROP TABLE t; --", 'hv:', 'x:production', 'hv:Production', '']) expect(() => runbook(ns), ns).toThrow('runbook');
    expect(() => runbook(NS, '2026-09-30')).toThrow();
    expect(() => runbook(NS, '20260930', '2026093014', "a'b")).toThrow();
  });
});

describe.skipIf(!hasPg)('the runbook against a real PostgreSQL', () => {
  let pg: Pg;
  beforeAll(async () => { pg = await startPg(); });
  afterAll(async () => { await pg?.stop(); });

  it('every statement gives the state its Redis command gives', async () => {
    const redis = new FakeRedis(), neon = createNeonStore(CS, (u, i) => pg.fetch(u, i));
    const read = async (s: { exec(c: Command[]): Promise<unknown[]> }) => (await s.exec([['HMGET', `${NS}:ctl`, ...CTL_FIELDS], ['SMEMBERS', `${NS}:void:r3:s3`], ['HLEN', `${NS}:vote:r3:s3`]])).map((x) => (Array.isArray(x) && x.every((y) => typeof y === 'string') ? [...x].sort() : x));
    await neon.exec([['HLEN', 'x']]); // create the tables
    const seed = ['a'.repeat(32), 'b'.repeat(32)];
    for (const n of seed) { redis.admin(['HSETNX', `${NS}:vote:r3:s3`, n, '2026093014d2857a3f']); await pg.sql(`INSERT INTO public.hv_hash VALUES ('${NS}:vote:r3:s3','${n}','2026093014d2857a3f')`); }
    const steps = ['close', 'shield', 'share-day', 'cap', 'minv', 'max', 'void-group', 'void-group-hour', 'void-hour', 'unvoid', 'reopen', 'clear-knobs', 'void-hour', 'reset-poll'];
    for (const step of steps) {
      const it = id(step);
      redis.admin(it.redis.split(' '));
      await pg.sql(it.sql);
      expect(await read(neon), step).toEqual(await read(redis));
    }
    expect(await read(neon)).toEqual([[null, null, null, null, null, null, '200', null], ['2026093014', 'T:2026093014:a3f'], 0]); // minv stays, the hour void and the hour-group void stay, the poll is empty
  });

  it('the read-only statements run and show what the Redis command shows', async () => {
    const neon = createNeonStore(CS, (u, i) => pg.fetch(u, i));
    await neon.exec([['SET', `${NS}:rlg:20260930`, 0, 'EX', 2592000, 'NX'], ['INCR', `${NS}:rlg:20260930`], ['HSETNX', `${NS}:vote:r3:s3`, 'n1', '2026093014d2857a3f'], ['HSETNX', `${NS}:vote:r3:s3`, 'n2', '2026093015d2857a3f']]);
    await pg.sql(id('show-knobs').sql); await pg.sql(id('list-voids').sql);
    expect(await pg.sql(id('count').sql)).toBe('2');
    expect((await pg.sql(id('audit-hour').sql)).split('\n')).toEqual(['2026093014|1', '2026093015|1']);
    expect(await pg.sql(id('audit-day-group').sql)).toBe('20260930|a3f|2');
    await pg.sql(id('counted-today').sql); // the day in the statement is now(), so today's row is absent: it must simply run
  });
});

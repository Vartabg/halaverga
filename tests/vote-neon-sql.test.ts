import { describe, expect, it } from 'vitest';
import { VOTE_KEY_TAG } from '@/lib/vote/ballot';
import { gateA, gateB, writeEntry } from '@/server/vote/gate';
import { CTL_FIELDS } from '@/server/vote/limits';
import { SQL, translate } from '@/server/vote/neonSql';
import type { Command } from '@/server/vote/store';
import { D } from './helpers/voteBody';

// The literals are copied here, not imported, so an edit to a constant in neonSql.ts fails these tests (spec-neon 4.1).
const LIT = {
  setnx: "INSERT INTO public.hv_kv AS t (k, v, exp) VALUES ($1, $2, now() + $3::int * interval '1 second') ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, exp = EXCLUDED.exp WHERE t.exp IS NOT NULL AND t.exp <= now() RETURNING 1",
  incr: "INSERT INTO public.hv_kv AS t (k, v) VALUES ($1, '1') ON CONFLICT (k) DO UPDATE SET v = CASE WHEN t.exp IS NOT NULL AND t.exp <= now() THEN '1' ELSE (t.v::bigint + 1)::text END, exp = CASE WHEN t.exp IS NOT NULL AND t.exp <= now() THEN NULL ELSE t.exp END RETURNING v",
  decr: "INSERT INTO public.hv_kv AS t (k, v) VALUES ($1, '-1') ON CONFLICT (k) DO UPDATE SET v = CASE WHEN t.exp IS NOT NULL AND t.exp <= now() THEN '-1' ELSE (t.v::bigint - 1)::text END, exp = CASE WHEN t.exp IS NOT NULL AND t.exp <= now() THEN NULL ELSE t.exp END RETURNING v",
  hmget: 'SELECT h.value FROM jsonb_array_elements_text($2::jsonb) WITH ORDINALITY AS f(field, ord) LEFT JOIN public.hv_hash h ON h.k = $1 AND h.field = f.field ORDER BY f.ord',
  hlen: 'SELECT count(*)::text FROM public.hv_hash WHERE k = $1',
  hsetnx: 'INSERT INTO public.hv_hash (k, field, value) VALUES ($1, $2, $3) ON CONFLICT (k, field) DO NOTHING RETURNING 1',
  hgetall: 'SELECT field, value FROM public.hv_hash WHERE k = $1 ORDER BY field COLLATE "C"',
  smembers: 'SELECT member FROM public.hv_set WHERE k = $1 ORDER BY member COLLATE "C"',
};
const stmt = (c: Command) => translate([c]).stmts[0];

describe('translate: the eight command forms, byte for byte (mutation: edit any SQL constant)', () => {
  it('SET k v EX n NX, any case of the command and the option tokens', () => {
    for (const c of [['SET', 'k', 'v', 'EX', 90000, 'NX'], ['set', 'k', 'v', 'ex', '90000', 'nx'], ['Set', 'k', 'v', 'eX', 90000, 'Nx']] as Command[]) {
      expect(stmt(c)).toEqual({ query: LIT.setnx, params: ['k', 'v', '90000'] });
    }
    expect(stmt(['SET', 'k', 0, 'EX', 2147483647, 'NX'])).toEqual({ query: LIT.setnx, params: ['k', '0', '2147483647'] });
  });
  it('INCR, DECR, HLEN, HGETALL, SMEMBERS, HSETNX', () => {
    expect(stmt(['incr', 'k'])).toEqual({ query: LIT.incr, params: ['k'] });
    expect(stmt(['DECR', 'k'])).toEqual({ query: LIT.decr, params: ['k'] }); // CODE-2: the undo of a replay's unit INCR
    expect(stmt(['HLEN', 'k'])).toEqual({ query: LIT.hlen, params: ['k'] });
    expect(stmt(['hgetall', 'k'])).toEqual({ query: LIT.hgetall, params: ['k'] });
    expect(stmt(['SMEMBERS', 'k'])).toEqual({ query: LIT.smembers, params: ['k'] });
    expect(stmt(['HSETNX', 'k', 'f', 'v'])).toEqual({ query: LIT.hsetnx, params: ['k', 'f', 'v'] });
  });
  it('HMGET carries the whole field list in ONE JSON-string parameter, so the SQL text never changes with n', () => {
    expect(stmt(['HMGET', 'k', 'a'])).toEqual({ query: LIT.hmget, params: ['k', '["a"]'] });
    expect(stmt(['hmget', 'k', 'a', 'b', 'c'])).toEqual({ query: LIT.hmget, params: ['k', '["a","b","c"]'] });
    expect(typeof stmt(['HMGET', 'k', 'a', 'b']).params[1]).toBe('string');
  });
  it('a number argument is accepted and stringified, and every parameter is a string', () => {
    expect(stmt(['HSETNX', 'k', 'f', 5])).toEqual({ query: LIT.hsetnx, params: ['k', 'f', '5'] });
    expect(stmt(['HSETNX', 'k', 'f', -1.5]).params).toEqual(['k', 'f', '-1.5']);
  });
  it('SQL holds exactly the eight constants', () => { expect(SQL).toEqual(LIT); });
});

describe('translate: the real gate batches', () => {
  const keys = { unit: 'aaaaaa', block: 'bbbbbb', round: 'cccccc' }, nonce = 'd'.repeat(32);
  it('gate A (5 commands) gives 5 statements in order with string params', () => {
    const { stmts, maps } = translate(gateA('hv:test', VOTE_KEY_TAG, D, keys, nonce));
    expect(stmts.map((s) => s.query)).toEqual([LIT.hmget, LIT.hlen, LIT.hmget, LIT.setnx, LIT.incr]);
    expect(stmts[0].params).toEqual(['hv:test:ctl', JSON.stringify([...CTL_FIELDS])]);
    expect(stmts[0].params[1]).toBe('["mode","unit","block","global","max","cap","minv","round"]');
    expect(stmts[2].params).toEqual([`hv:test:vote:${VOTE_KEY_TAG}`, JSON.stringify([nonce])]);
    expect(stmts[3].params).toEqual([`hv:test:rl:u:${D}:aaaaaa`, '0', '90000']);
    expect(maps).toHaveLength(5);
    for (const s of stmts) for (const p of s.params) expect(typeof p).toBe('string');
  });
  it('gate B (6 commands) and the write', () => {
    const { stmts } = translate(gateB('hv:test', D, keys));
    expect(stmts.map((s) => s.query)).toEqual([LIT.setnx, LIT.incr, LIT.setnx, LIT.incr, LIT.setnx, LIT.incr]);
    expect(stmts[0].params).toEqual([`hv:test:rl:b:${D}:bbbbbb`, '0', '90000']);
    expect(stmts[2].params).toEqual(['hv:test:rl:r:cccccc', '0', '2592000']);
    expect(stmts[4].params).toEqual([`hv:test:rlg:${D}`, '0', '2592000']);
    expect(translate(writeEntry('hv:test', VOTE_KEY_TAG, 'n'.repeat(32), 'entry')).stmts).toEqual([{ query: LIT.hsetnx, params: [`hv:test:vote:${VOTE_KEY_TAG}`, 'n'.repeat(32), 'entry'] }]);
  });
});

describe('translate: hostile arguments only ever reach params (mutation: build one query with a template literal)', () => {
  const hostile = ["'; DROP TABLE hv_kv; --", '$1', '\\', '%s', '${x}', 'x'.repeat(10_000), '\u{1F680}\u{1F600}', 'a"b\'c', '\n; SELECT 1', '$$', ':name'];
  const forms = (h: string): Command[] => [
    ['SET', h, h, 'EX', 5, 'NX'], ['INCR', h], ['DECR', h], ['HMGET', h, h, 'a'], ['HLEN', h], ['HSETNX', h, h, h], ['HGETALL', h], ['SMEMBERS', h],
  ];
  it('the set of distinct queries stays inside the constants and the text appears only in params', () => {
    const allowed = new Set<string>(Object.values(LIT));
    for (const h of hostile) {
      const { stmts } = translate(forms(h));
      expect(stmts).toHaveLength(8);
      for (const s of stmts) {
        expect(allowed.has(s.query), h.slice(0, 20)).toBe(true);
        if (h.length > 4) expect(s.query.includes(h)).toBe(false);
        expect(s.params.some((p) => p !== null && p.includes(h))).toBe(true);
      }
    }
    expect(new Set(hostile.flatMap((h) => translate(forms(h)).stmts.map((s) => s.query))).size).toBe(8);
  });
  it('the HMGET field list stays inside the one JSON-string parameter', () => {
    const [, list] = stmt(['HMGET', 'k', "x'); DROP TABLE hv_kv; --", '$2']).params;
    expect(JSON.parse(list as string)).toEqual(["x'); DROP TABLE hv_kv; --", '$2']);
  });
});

describe('translate: rejections (each throws before any network call)', () => {
  const UNSUP = 'vote store unsupported command', ARG = 'vote store bad argument';
  it('names and options the vote never sends', () => {
    const bad: Command[] = [
      ['GET', 'k'], ['HSET', 'k', 'f', 'v'], ['SADD', 'k', 'm'], ['EVAL', 'x'], ['DEL', 'k'], ['FLUSHALL'], [], ['constructor', 'k'], ['__proto__', 'k'],
      ['SET', 'k', 'v'], ['SET', 'k', 'v', 'NX'], ['SET', 'k', 'v', 'EX', 0, 'NX'], ['SET', 'k', 'v', 'EX', -1, 'NX'], ['SET', 'k', 'v', 'EX', 1.5, 'NX'],
      ['SET', 'k', 'v', 'EX', 2147483648, 'NX'], ['SET', 'k', 'v', 'EX', 'abc', 'NX'], ['SET', 'k', 'v', 'NX', 5, 'EX'], ['SET', 'k', 'v', 'EX', 5], ['SET', 'k', 'v', 'EX', 5, 'XX'],
      ['SET', 'k', 'v', 'EX', '05', 'NX'], ['SET', 'k', 'v', 'PX', 5, 'NX'],
      ['HMGET', 'k'], ['HMGET'], ['INCR'], ['INCR', 'a', 'b'], ['DECR'], ['DECR', 'a', 'b'], ['HLEN'], ['HLEN', 'a', 'b'], ['HSETNX', 'k', 'f'], ['HSETNX', 'k', 'f', 'v', 'x'],
      ['HGETALL'], ['HGETALL', 'a', 'b'], ['SMEMBERS'], ['SMEMBERS', 'a', 'b'],
    ];
    for (const c of bad) expect(() => translate([c]), JSON.stringify(c)).toThrow(UNSUP);
    expect(() => translate([['INCR', 'k'], ['GET', 'k']])).toThrow(UNSUP);
  });
  it('arguments Postgres text or JSON cannot carry', () => {
    const bad = [['INCR', 'a\u0000b'], ['HSETNX', 'k', 'f', 'v\u0000'], ['HMGET', 'k', 'a\u0000'], ['INCR', '\ud800'], ['INCR', 'x\udc00y'], ['INCR', NaN], ['INCR', Infinity],
      ['INCR', {}], ['INCR', undefined], ['INCR', null], ['INCR', ['a']], ['INCR', true], ['HSETNX', 'k', 'f', {}]] as unknown as Command[];
    for (const c of bad) expect(() => translate([c]), String(c)).toThrow(ARG);
    expect(stmt(['INCR', '🚀']).params).toEqual(['🚀']); // a well-formed pair is fine
  });
});

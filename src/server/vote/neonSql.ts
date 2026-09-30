// Redis command -> one Postgres statement (spec-neon 4). The vote sends exactly seven command forms and this translator supports
// exactly those: anything else throws before any network call (a programmer error, never reachable from a request). Every SQL text
// is a constant below. No template literal, concatenation or replace ever touches an argument: keys, fields, values, seconds and the
// HMGET field list reach Postgres only in `params`, and only as JSON strings, so no wire-side type conversion applies.
import type { Command } from './store';
import { mapHgetall, mapHlen, mapHmget, mapHsetnx, mapIncr, mapSetNx, mapSmembers, type RowMapper } from './neonReply';

export type { RowMapper };
export interface NeonStmt { query: string; params: (string | null)[] }

export const SQL = {
  setnx: "INSERT INTO public.hv_kv AS t (k, v, exp) VALUES ($1, $2, now() + $3::int * interval '1 second') ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, exp = EXCLUDED.exp WHERE t.exp IS NOT NULL AND t.exp <= now() RETURNING 1",
  incr: "INSERT INTO public.hv_kv AS t (k, v) VALUES ($1, '1') ON CONFLICT (k) DO UPDATE SET v = CASE WHEN t.exp IS NOT NULL AND t.exp <= now() THEN '1' ELSE (t.v::bigint + 1)::text END, exp = CASE WHEN t.exp IS NOT NULL AND t.exp <= now() THEN NULL ELSE t.exp END RETURNING v",
  hmget: 'SELECT h.value FROM jsonb_array_elements_text($2::jsonb) WITH ORDINALITY AS f(field, ord) LEFT JOIN public.hv_hash h ON h.k = $1 AND h.field = f.field ORDER BY f.ord',
  hlen: 'SELECT count(*)::text FROM public.hv_hash WHERE k = $1',
  hsetnx: 'INSERT INTO public.hv_hash (k, field, value) VALUES ($1, $2, $3) ON CONFLICT (k, field) DO NOTHING RETURNING 1',
  hgetall: 'SELECT field, value FROM public.hv_hash WHERE k = $1 ORDER BY field COLLATE "C"',
  smembers: 'SELECT member FROM public.hv_set WHERE k = $1 ORDER BY member COLLATE "C"',
} as const;

const unsupported = () => new Error('vote store unsupported command');
const badArg = () => new Error('vote store bad argument');
// A lone surrogate cannot be encoded in the JSON body and \u0000 cannot be stored in Postgres text: refuse up front so no value can
// fail halfway through a batch.
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function text(a: unknown): string {
  if (typeof a === 'number' && Number.isFinite(a)) return String(a);
  if (typeof a !== 'string' || a.includes('\u0000') || LONE.test(a)) throw badArg();
  return a;
}

/** Arity of each supported command, [min, max] including the name. */
const ARITY: Record<string, [number, number]> = {
  SET: [6, 6], INCR: [2, 2], HMGET: [3, Infinity], HLEN: [2, 2], HSETNX: [4, 4], HGETALL: [2, 2], SMEMBERS: [2, 2],
};

function one(cmd: Command): { stmt: NeonStmt; map: RowMapper } {
  if (!Array.isArray(cmd) || typeof cmd[0] !== 'string') throw unsupported();
  const name = cmd[0].toUpperCase(), arity = ARITY[Object.hasOwn(ARITY, name) ? name : ''];
  if (!arity || cmd.length < arity[0] || cmd.length > arity[1]) throw unsupported();
  const a = cmd.slice(1).map(text);
  switch (name) {
    case 'SET': {
      // SET k v EX n NX, exactly, n a whole number of seconds that fits a Postgres int.
      if (a[2].toUpperCase() !== 'EX' || a[4].toUpperCase() !== 'NX' || !/^[1-9][0-9]{0,9}$/.test(a[3]) || Number(a[3]) > 2147483647) throw unsupported();
      return { stmt: { query: SQL.setnx, params: [a[0], a[1], a[3]] }, map: mapSetNx };
    }
    case 'INCR': return { stmt: { query: SQL.incr, params: [a[0]] }, map: mapIncr };
    // One JSON-string parameter holds the field list, so the SQL text never changes with n. It is a string, never a JSON array,
    // because the endpoint turns a JSON array into a Postgres array literal.
    case 'HMGET': return { stmt: { query: SQL.hmget, params: [a[0], JSON.stringify(a.slice(1))] }, map: mapHmget(a.length - 1) };
    case 'HLEN': return { stmt: { query: SQL.hlen, params: [a[0]] }, map: mapHlen };
    case 'HSETNX': return { stmt: { query: SQL.hsetnx, params: [a[0], a[1], a[2]] }, map: mapHsetnx };
    case 'HGETALL': return { stmt: { query: SQL.hgetall, params: [a[0]] }, map: mapHgetall };
    default: return { stmt: { query: SQL.smembers, params: [a[0]] }, map: mapSmembers };
  }
}

/** One statement and one mapper per command, in order. Pure: no I/O. Throws 'vote store unsupported command' or 'vote store bad argument'. */
export function translate(cmds: Command[]): { stmts: NeonStmt[]; maps: RowMapper[] } {
  const parts = cmds.map(one);
  return { stmts: parts.map((p) => p.stmt), maps: parts.map((p) => p.map) };
}

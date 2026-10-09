// Row -> Redis-style reply mappers for the Neon adapter (spec-neon 4.1, 4.4). With Neon-Raw-Text-Output every non-null cell is a JSON
// string and NULL is null; rows are arrays (array mode). Only `rows` is read, never `rowCount` or `command`. Any surprise throws the
// same constant error: a reply that does not fit is a store failure, never a guess.
export type Rows = (string | null)[][];
export type RowMapper = (rows: Rows) => unknown;

const bad = (): never => { throw new Error('vote store bad reply'); };

/** Digits-only (optionally signed) text to a safe integer; 9,007,199,254,740,991 is the ceiling and anything past it fails loudly. */
export function safeInt(cell: string | null, signed = false): number {
  if (typeof cell !== 'string' || !(signed ? /^-?[0-9]+$/ : /^[0-9]+$/).test(cell)) return bad();
  const n = Number(cell);
  return Number.isSafeInteger(n) ? n || 0 : bad();
}

/** rows must be an array of arrays whose cells are strings or null, every row `width` cells wide. */
function grid(rows: unknown, width: number): Rows {
  if (!Array.isArray(rows)) return bad();
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== width) return bad();
    for (const c of r) if (c !== null && typeof c !== 'string') return bad();
  }
  return rows as Rows;
}
const one = (rows: unknown, signed: boolean) => { const g = grid(rows, 1); return g.length === 1 ? safeInt(g[0][0], signed) : bad(); };
const strings = (rows: Rows) => { for (const r of rows) for (const c of r) if (c === null) bad(); };

/** SET k v EX n NX: 1 row means stored (or replaced an expired row), 0 rows means a live key exists. */
export const mapSetNx: RowMapper = (rows) => {
  const g = grid(rows, 1);
  if (g.length === 0) return null;
  return g.length === 1 && g[0][0] === '1' ? 'OK' : bad();
};
/** INCR: the integer after the increment. */
export const mapIncr: RowMapper = (rows) => one(rows, true);
/** HMGET with n fields: one row per field in order, null for a missing field or hash. */
export const mapHmget = (n: number): RowMapper => (rows) => {
  const g = grid(rows, 1);
  return g.length === n ? g.map((r) => r[0]) : bad();
};
export const mapHlen: RowMapper = (rows) => one(rows, false);
/** HSETNX: 1 stored, 0 the field already existed (its value is untouched). */
export const mapHsetnx: RowMapper = (rows) => {
  const g = grid(rows, 1);
  if (g.length === 0) return 0;
  return g.length === 1 && g[0][0] === '1' ? 1 : bad();
};
/** HGETALL: the flat [field, value, ...] array Upstash returns; [] for a missing hash. */
export const mapHgetall: RowMapper = (rows) => { const g = grid(rows, 2); strings(g); return g.flat(); };
export const mapSmembers: RowMapper = (rows) => { const g = grid(rows, 1); strings(g); return g.map((r) => r[0]); };

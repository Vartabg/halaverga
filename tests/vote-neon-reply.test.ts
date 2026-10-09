import { describe, expect, it } from 'vitest';
import { mapHgetall, mapHlen, mapHmget, mapHsetnx, mapIncr, mapSetNx, mapSmembers, safeInt, type Rows } from '@/server/vote/neonReply';
import fx from './fixtures/neon-replies.json';

// Rows in the documented envelope: raw text output, array mode. Only `rows` is read, never rowCount or command.
const rowsOf = (env: { results: { rows: unknown }[] }, i = 0) => env.results[i].rows as Rows;
const BAD = 'vote store bad reply';

describe('the fixtures follow the documented envelope', () => {
  it('rows are arrays of arrays whose cells are strings or null', () => {
    for (const env of [fx.select, fx.insertReturning, fx.insertConflict]) for (const r of rowsOf(env)) { expect(Array.isArray(r)).toBe(true); for (const c of r) expect(c === null || typeof c === 'string').toBe(true); }
    expect(rowsOf(fx.select)).toEqual([['closed'], [null], ['3']]);
  });
});

describe('mapSetNx (mutation: map 0 rows to OK)', () => {
  it('1 row is OK, 0 rows is null (a live key exists), anything else is a bad reply', () => {
    expect(mapSetNx(rowsOf(fx.insertReturning))).toBe('OK');
    expect(mapSetNx(rowsOf(fx.insertConflict))).toBeNull();
    expect(mapSetNx([])).toBeNull();
    for (const bad of [[['2']], [['1'], ['1']], [[null]], [['1', '1']], [[1]], 'x', null, [['']]]) expect(() => mapSetNx(bad as Rows), JSON.stringify(bad)).toThrow(BAD);
  });
});

describe('mapIncr and safeInt (mutation: return the string)', () => {
  it('returns the number after the increment', () => {
    expect(mapIncr([['1']])).toBe(1);
    expect(mapIncr([['1201']])).toBe(1201);
    expect(mapIncr([['9007199254740991']])).toBe(9007199254740991);
    expect(mapIncr([['-3']])).toBe(-3);
    expect(Object.is(mapIncr([['-0']]), 0)).toBe(true);
  });
  it('throws on an unsafe integer, text, null, or the wrong number of rows or cells', () => {
    for (const bad of [[['9007199254740992']], [['abc']], [['1.5']], [['']], [[null]], [], [['1'], ['2']], [['1', '2']], [[3]], [['+1']], [[' 1']]]) expect(() => mapIncr(bad as Rows), JSON.stringify(bad)).toThrow(BAD);
  });
  it('safeInt is digits-only unless signed', () => {
    expect(safeInt('0')).toBe(0);
    expect(() => safeInt('-1')).toThrow(BAD);
    expect(safeInt('-1', true)).toBe(-1);
    expect(() => safeInt(null)).toThrow(BAD);
  });
});

describe('mapHmget', () => {
  it('gives one entry per requested field in order, null for a missing field', () => {
    expect(mapHmget(3)(rowsOf(fx.select))).toEqual(['closed', null, '3']);
    expect(mapHmget(2)([[null], [null]])).toEqual([null, null]);
    expect(mapHmget(1)([['x']])).toEqual(['x']);
  });
  it('throws on a different row count, a numeric cell or a wide row', () => {
    for (const [n, bad] of [[3, [['a'], ['b']]], [1, []], [1, [['a'], ['b']]], [1, [[3]]], [1, [['a', 'b']]], [1, [[]]]] as [number, unknown][]) expect(() => mapHmget(n)(bad as Rows), JSON.stringify(bad)).toThrow(BAD);
  });
});

describe('mapHlen', () => {
  it('reads a count', () => { expect(mapHlen([['0']])).toBe(0); expect(mapHlen([['6000']])).toBe(6000); });
  it('throws on a negative, fractional, null or missing count', () => {
    for (const bad of [[['-1']], [['1.5']], [[null]], [], [['1'], ['1']], [[6000]]]) expect(() => mapHlen(bad as Rows), JSON.stringify(bad)).toThrow(BAD);
  });
});

describe('mapHsetnx', () => {
  it('0 rows is 0 (the field existed, its value is untouched) and 1 row is 1', () => {
    expect(mapHsetnx([])).toBe(0);
    expect(mapHsetnx(rowsOf(fx.insertConflict))).toBe(0);
    expect(mapHsetnx([['1']])).toBe(1);
    expect(mapHsetnx(rowsOf(fx.insertReturning))).toBe(1);
  });
  it('throws on a 0 cell or several rows', () => { for (const bad of [[['0']], [['1'], ['1']], [[null]], [['2']]]) expect(() => mapHsetnx(bad as Rows), JSON.stringify(bad)).toThrow(BAD); });
});

describe('mapHgetall (mutation: reorder)', () => {
  it('flattens the rows into the [field, value, ...] array Upstash returns, in row order', () => {
    expect(mapHgetall([['n1', 'e1'], ['n2', 'e2']])).toEqual(['n1', 'e1', 'n2', 'e2']);
    expect(mapHgetall([['n2', 'e2'], ['n1', 'e1']])).toEqual(['n2', 'e2', 'n1', 'e1']);
    expect(mapHgetall([])).toEqual([]);
  });
  it('throws on a row that is not two strings', () => {
    for (const bad of [[['a', 'b', 'c']], [['a']], [['a', null]], [[null, 'b']], [['a', 1]], [['a', 'b'], ['c']]]) expect(() => mapHgetall(bad as Rows), JSON.stringify(bad)).toThrow(BAD);
  });
});

describe('mapSmembers', () => {
  it('lists the members in row order, [] for a missing set', () => {
    expect(mapSmembers([['a'], ['b']])).toEqual(['a', 'b']);
    expect(mapSmembers([])).toEqual([]);
  });
  it('throws on a null member or a wide row', () => { for (const bad of [[[null]], [['a', 'b']], [[1]]]) expect(() => mapSmembers(bad as Rows), JSON.stringify(bad)).toThrow(BAD); });
});

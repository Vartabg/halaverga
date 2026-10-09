import { describe, expect, it } from 'vitest';
import { gateA, gateB, readGateA, readGateB, routeAfterA, routeAfterB, undoUnit, writeEntry, type GateAReply } from '@/server/vote/gate';
import { VOTE_KEY_TAG } from '@/lib/vote/ballot';
import { DEFAULT_LIMITS } from '@/server/vote/limits';
import { D } from './helpers/voteBody';

const ctl = (over: (string | null)[] = []) => [...over, ...Array(8).fill(null)].slice(0, 8);
const reply = (o: { ctl?: unknown; entries?: unknown; seen?: unknown; unit?: unknown } = {}) => {
  const pick = <K extends keyof typeof o>(k: K, d: unknown) => (k in o ? o[k] : d); // an explicit null is a value, not "use the default"
  return [pick('ctl', ctl()), pick('entries', 0), pick('seen', [null]), 'OK', pick('unit', 1)];
};
const a = (over: Partial<GateAReply['limits']> = {}, n: Partial<Omit<GateAReply, 'limits'>> = {}): GateAReply =>
  ({ limits: { ...DEFAULT_LIMITS, ...over }, entries: 0, seen: false, unit: 1, ...n });
const b = (block = 1, round = 1, global = 1) => ({ block, round, global });
const NONCE = 'f'.repeat(32);

describe('gate commands', () => {
  it('gate A is 5 commands: the knobs, the vote count, this nonce, and one SET NX EX plus INCR on the unit bucket; the block is not touched', () => {
    expect(gateA('hv:x', 'r3:s3', '20260930', { unit: 'aaaaaa' }, NONCE)).toEqual([
      ['HMGET', 'hv:x:ctl', 'mode', 'unit', 'block', 'global', 'max', 'cap', 'minv', 'round'], ['HLEN', 'hv:x:vote:r3:s3'],
      ['HMGET', 'hv:x:vote:r3:s3', NONCE],
      ['SET', 'hv:x:rl:u:20260930:aaaaaa', 0, 'EX', 90000, 'NX'], ['INCR', 'hv:x:rl:u:20260930:aaaaaa'],
    ]);
  });
  it('gate B is 6 commands (block per day, round for 30 days, day counter for 30 days), and the write is one HSETNX', () => {
    expect(gateB('hv:x', '20260930', { block: 'bbbbbb', round: 'cccccc' })).toEqual([
      ['SET', 'hv:x:rl:b:20260930:bbbbbb', 0, 'EX', 90000, 'NX'], ['INCR', 'hv:x:rl:b:20260930:bbbbbb'],
      ['SET', 'hv:x:rl:r:cccccc', 0, 'EX', 2592000, 'NX'], ['INCR', 'hv:x:rl:r:cccccc'],
      ['SET', 'hv:x:rlg:20260930', 0, 'EX', 2592000, 'NX'], ['INCR', 'hv:x:rlg:20260930'],
    ]);
    expect(writeEntry('hv:x', 'r3:s3', 'n'.repeat(32), 'entry')).toEqual([['HSETNX', 'hv:x:vote:r3:s3', 'n'.repeat(32), 'entry']]);
  });
  it('puts the day in the unit, block and day keys, so a new UTC day is new keys; the round key has no day', () => {
    const k = (d: string) => JSON.stringify([gateA('n', 'r', d, { unit: 'u' }, NONCE), gateB('n', d, { block: 'b', round: 'r' })]);
    expect(k('20260930')).not.toBe(k('20261001'));
    const round = (d: string) => gateB('n', d, { block: 'b', round: 'r' })[2];
    expect(round('20260930')).toEqual(round('20261001'));
  });
});

describe('readGateA and readGateB', () => {
  it('reads the limits, the entry count, whether the nonce is stored, and the unit counter', () => {
    expect(readGateA(reply({ ctl: ctl(['open', '3']), entries: 7, unit: 2 }))).toEqual({ limits: { ...DEFAULT_LIMITS, unit: 3 }, entries: 7, seen: false, unit: 2 });
    expect(readGateA(reply({ seen: ['e'] })).seen).toBe(true);
  });
  it('throws on anything malformed: length, a non-array knob reply, a nonce reply that is not one string or null, a counter that is not a count', () => {
    for (const bad of [[], reply().slice(0, 4), [...reply(), 1], reply({ ctl: 'open' }), reply({ ctl: null }), reply({ entries: '7' }), reply({ unit: -1 }), reply({ unit: 1.5 }),
      reply({ unit: null }), reply({ unit: NaN }), reply({ unit: 2 ** 60 }), reply({ seen: null }), reply({ seen: [] }), reply({ seen: [1] }), reply({ seen: ['a', 'b'] }), reply({ seen: 'e' })]) {
      expect(() => readGateA(bad as unknown[])).toThrow();
    }
    for (const bad of [[], ['OK'], ['OK', 1], ['OK', 1, 'OK', 1, 'OK'], ['OK', 1, 'OK', 1, 'OK', null], ['OK', 1, 'OK', -1, 'OK', 1], ['OK', 1.5, 'OK', 1, 'OK', 1], [1, 1, 1, 1, 1, 1, 1]]) expect(() => readGateB(bad)).toThrow();
    expect(readGateB(['OK', 3, 'OK', 4, 'OK', 1201])).toEqual({ block: 3, round: 4, global: 1201 });
  });
});

describe('routeAfterA', () => {
  it('goes on to gate B at the unit limit and refuses one past it; the block plays no part here', () => {
    expect(routeAfterA(a({}, { unit: 8 }))).toBe('gateB');
    expect(routeAfterA(a({}, { unit: 9 }))).toBe('refuse');
    expect(routeAfterA(a({ max: 100 }, { entries: 99 }))).toBe('gateB');
    expect(routeAfterA(a({ max: 100 }, { entries: 100 }))).toBe('refuse-latch');
  });
  it('F3 a nonce that is already stored is a replay: ok, and it never reaches gate B (no budget spent), even past the unit limit', () => {
    expect(routeAfterA(a({}, { seen: true }))).toBe('replay');
    expect(routeAfterA(a({}, { seen: true, unit: 99 }))).toBe('replay');
  });
  it('closed beats everything, and the ceiling (which latches) beats a unit refusal of a new ballot', () => {
    expect(routeAfterA(a({ mode: 'closed' }, { entries: 6000, unit: 99, seen: true }))).toBe('closed');
    expect(routeAfterA(a({}, { entries: 6000, unit: 99 }))).toBe('refuse-latch');
  });
  it('CODE-2 a stored nonce is a replay even when the round is full: it is ok and spends nothing, where before the ceiling refused it', () => {
    expect(routeAfterA(a({}, { entries: 6000, unit: 99, seen: true }))).toBe('replay');
  });
  it('CODE-2 undoUnit is one DECR of the unit key gate A incremented, so a replay nets zero budget', () => {
    expect(undoUnit('hv:test', D, { unit: 'aaaaaa' })).toEqual([['DECR', `hv:test:rl:u:${D}:aaaaaa`]]);
    expect(gateA('hv:test', VOTE_KEY_TAG, D, { unit: 'aaaaaa' }, 'n')[4]).toEqual(['INCR', `hv:test:rl:u:${D}:aaaaaa`]);
  });
  it('C6 a knob reply that is not exactly 8 fields is a bad reply (a gate never opens on a truncated read), while 8 nulls are the defaults', () => {
    const ok = (ctl: unknown) => [ctl, 0, [null], 'OK', 1];
    expect(() => readGateA(ok([]))).toThrow('bad reply');
    expect(() => readGateA(ok(Array(7).fill(null)))).toThrow('bad reply');
    expect(() => readGateA(ok(Array(9).fill(null)))).toThrow('bad reply');
    expect(readGateA(ok(Array(8).fill(null))).limits.mode).toBe('open');
  });
});

describe('routeAfterB', () => {
  it('writes up to the day limit and latches from the next request', () => {
    expect(routeAfterB(b(1, 1, 1200), a())).toBe('write');
    expect(routeAfterB(b(1, 1, 1201), a())).toBe('refuse-latch');
    expect(routeAfterB(b(1, 1, 4), a({ global: 3 }))).toBe('refuse-latch');
    expect(routeAfterB(b(1, 1, 3), a({ global: 3 }))).toBe('write');
  });
  it('refuses a block one past its limit (refuse, back at UTC midnight) and a network one past its round limit (refuse-round)', () => {
    expect(routeAfterB(b(60, 1), a())).toBe('write');
    expect(routeAfterB(b(61, 1), a())).toBe('refuse');
    expect(routeAfterB(b(1, 10), a())).toBe('write');
    expect(routeAfterB(b(1, 11), a())).toBe('refuse-round');
    expect(routeAfterB(b(61, 11, 1201), a())).toBe('refuse-latch');
    expect(routeAfterB(b(61, 11), a())).toBe('refuse');
  });
});

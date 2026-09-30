// The vote's Redis commands and the decisions on their replies (spec 4.1), pure. Gate A (one MULTI, 5 commands) reads the knobs, the
// vote count and whether this nonce is already stored, and bumps the unit counter; gate B (6 commands) is reached only by a new
// ballot that passed A and bumps the block, round and day counters; the write is one HSETNX, the dedupe, the record and the undo
// handle in one command. The block counter never moves for a request the unit limit refused (one address cannot lock its /24), and a
// resend of a stored nonce never reaches B (it costs no budget). Nothing here talks to a store.
import { CTL_FIELDS, limitsFrom, type Limits } from './limits';
import type { Command } from './store';

const RATE_TTL_S = 90_000; // 25 h: a unit or block bucket outlives its UTC day by an hour
const GLOBAL_TTL_S = 2_592_000; // 30 days: the audit's evidence of a capped day
export const ROUND_TTL_S = 2_592_000; // 30 days: a round counter holds only a count, keyed by network, no vote and no address

export function gateA(ns: string, rt: string, day: string, keys: { unit: string }, nonce: string): Command[] {
  const unit = `${ns}:rl:u:${day}:${keys.unit}`;
  return [
    ['HMGET', `${ns}:ctl`, ...CTL_FIELDS],
    ['HLEN', `${ns}:vote:${rt}`],
    ['HMGET', `${ns}:vote:${rt}`, nonce],
    ['SET', unit, 0, 'EX', RATE_TTL_S, 'NX'], ['INCR', unit],
  ];
}

const count = (x: unknown): number => {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0) throw new Error('vote gate: bad reply');
  return x;
};

/** The reply of gateA. Throws on anything malformed (the handler answers 502): a gate never decides on a reply it cannot read. */
export function readGateA(reply: unknown[]): { limits: Limits; entries: number; seen: boolean; unit: number } {
  if (!Array.isArray(reply) || reply.length !== 5 || !Array.isArray(reply[0]) || !Array.isArray(reply[2]) || reply[2].length !== 1) throw new Error('vote gate: bad reply');
  const stored = reply[2][0];
  if (stored !== null && typeof stored !== 'string') throw new Error('vote gate: bad reply');
  return { limits: limitsFrom(reply[0]), entries: count(reply[1]), seen: stored !== null, unit: count(reply[4]) };
}
export type GateAReply = ReturnType<typeof readGateA>;

/**
 * closed: the kill switch (503). refuse-latch: the main ceiling is reached, so every vote today would be refused (429, the instance
 * latches). replay: this nonce is already stored, answer ok and spend nothing. refuse: this unit is over its limit (429 for this
 * request only). gateB: go on.
 */
export function routeAfterA(a: GateAReply): 'closed' | 'refuse-latch' | 'replay' | 'refuse' | 'gateB' {
  if (a.limits.mode !== 'open') return 'closed';
  if (a.entries >= a.limits.max) return 'refuse-latch';
  if (a.seen) return 'replay';
  if (a.unit > a.limits.unit) return 'refuse';
  return 'gateB';
}

export function gateB(ns: string, day: string, keys: { block: string; round: string }): Command[] {
  const block = `${ns}:rl:b:${day}:${keys.block}`, round = `${ns}:rl:r:${keys.round}`, global = `${ns}:rlg:${day}`;
  return [
    ['SET', block, 0, 'EX', RATE_TTL_S, 'NX'], ['INCR', block],
    ['SET', round, 0, 'EX', ROUND_TTL_S, 'NX'], ['INCR', round],
    ['SET', global, 0, 'EX', GLOBAL_TTL_S, 'NX'], ['INCR', global],
  ];
}

export function readGateB(reply: unknown[]): { block: number; round: number; global: number } {
  if (!Array.isArray(reply) || reply.length !== 6) throw new Error('vote gate: bad reply');
  return { block: count(reply[1]), round: count(reply[3]), global: count(reply[5]) };
}

/**
 * The day's global limit wins (every later vote today is refused too, so the instance latches), then the block's day limit
 * (refuse, resets at UTC midnight), then the network's round limit (refuse-round, no reset within the round).
 */
export function routeAfterB(b: { block: number; round: number; global: number }, a: GateAReply): 'write' | 'refuse-latch' | 'refuse' | 'refuse-round' {
  if (b.global > a.limits.global) return 'refuse-latch';
  if (b.block > a.limits.block) return 'refuse';
  if (b.round > a.limits.round) return 'refuse-round';
  return 'write';
}

export function writeEntry(ns: string, rt: string, nonce: string, entry: string): Command[] {
  return [['HSETNX', `${ns}:vote:${rt}`, nonce, entry]];
}

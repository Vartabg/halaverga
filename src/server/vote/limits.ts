// The vote's limits and the runtime knobs (spec section 3). Defaults live here; the owner changes them without a redeploy through
// the one `ctl` hash. Windows are UTC calendar days, except `round`, one counter per network that lasts 30 days. limitsFrom parses the
// 8-field HMGET reply and fails closed: a missing, non-integer or out-of-clamp field is ignored (the default applies), an unknown
// mode is closed, and a value can never open a gate wider than its clamp.
export const UNIT_LIMIT = 8;
export const BLOCK_LIMIT = 60; // counts only ballots that got past the unit limit, so one address can burn 8 of them a day, not the whole block
export const ROUND_LIMIT = 10; // counted ballots per network per 30 days: nothing links a network across days except this counter
export const GLOBAL_LIMIT = 1200;
export const MAX_ENTRIES = 6000;
export const CAP_DEFAULT = 5;
export const MINV_DEFAULT = 300; // below this a table is mostly luck (audit 2026-10-02: five equal controls differ by about 20 points at 300 votes); the owner can move it with `minv`

export interface Limits { mode: 'open' | 'closed'; unit: number; block: number; global: number; max: number; cap: number; minv: number; round: number }
export const DEFAULT_LIMITS: Readonly<Limits> = {
  mode: 'open', unit: UNIT_LIMIT, block: BLOCK_LIMIT, global: GLOBAL_LIMIT, max: MAX_ENTRIES, cap: CAP_DEFAULT, minv: MINV_DEFAULT, round: ROUND_LIMIT,
};

/** The ctl fields in HMGET order after `mode`, each with its clamp [min, max]. */
export const CTL_FIELDS = ['mode', 'unit', 'block', 'global', 'max', 'cap', 'minv', 'round'] as const;
const CLAMP: Record<Exclude<keyof Limits, 'mode'>, [number, number]> = {
  unit: [1, 200], block: [1, 2000], global: [1, 20000], max: [100, 20000], cap: [2, 100], minv: [10, 1000], round: [1, 1000],
};

function knob(raw: unknown, name: keyof typeof CLAMP): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
  const [lo, hi] = CLAMP[name];
  return Number.isInteger(n) && n >= lo && n <= hi ? n : DEFAULT_LIMITS[name];
}

/** `HMGET ctl mode unit block global max cap minv round` reply to Limits. A reply that is not an array of exactly 8 is closed (C6: a truncated reply never opens the gate). */
export function limitsFrom(reply: unknown): Limits {
  if (!Array.isArray(reply) || reply.length !== CTL_FIELDS.length) return { ...DEFAULT_LIMITS, mode: 'closed' };
  const [mode, unit, block, global, max, cap, minv, round] = reply;
  return {
    mode: mode === null || mode === undefined || mode === 'open' ? 'open' : 'closed',
    unit: knob(unit, 'unit'), block: knob(block, 'block'), global: knob(global, 'global'), max: knob(max, 'max'),
    cap: knob(cap, 'cap'), minv: knob(minv, 'minv'), round: knob(round, 'round'),
  };
}

/** UTC hour as YYYYMMDDHH. */
export const utcHour = (now: number): string => new Date(now).toISOString().replace(/[-T:]/g, '').slice(0, 10);
/** UTC date as YYYYMMDD. */
export const utcDate = (now: number): string => new Date(now).toISOString().replace(/-/g, '').slice(0, 8);

/** Milliseconds from `now` to the next UTC midnight (at least 1). */
export const msToUtcMidnight = (now: number): number => {
  const d = new Date(now);
  return Math.max(1, Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now);
};
/** Whole seconds from `now` to the next UTC midnight, when the unit, block and global counters start over (at least 1). */
export const secondsToUtcMidnight = (now: number): number => Math.max(1, Math.ceil(msToUtcMidnight(now) / 1000));

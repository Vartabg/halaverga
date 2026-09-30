// In-game vote v3: the one shape shared by the client card and the /api/vote server (spec 2.2). Pure: no Node, no DOM, no Next
// imports, so the lazy client chunk can use it too. The payload is six fields and no free text: every string is a registry id,
// the literal 'tie' or a 32-hex nonce. The server trusts nothing here without parseVote.
import { controlsFor, isControlFor, type ControlFamily, type ControlId } from '@/game/controlTypes';

export type VoteDevice = ControlFamily;
export const VOTE_DEVICES: readonly VoteDevice[] = ['touch', 'desktop'];
// Bump when the controls change meaningfully (the registry order is frozen per round, tests/vote-entry.test.ts): a new round starts
// a fresh tally and lets every device vote again.
export const VOTE_ROUND = 'r3';
/** The payload shape. A later shape change bumps this, and the tag below keeps the new data out of the old keys. */
export const VOTE_SCHEMA = 3;
/** Round and schema in one tag: every server key carries it. Not the per-vote network group tag of entry.ts. */
export const VOTE_KEY_TAG = `${VOTE_ROUND}:s${VOTE_SCHEMA}`;
export const VOTE_MAX_BYTES = 512;
/** Tried controls (at 20 s each) a family needs before a vote counts; the card and the server share it. */
export const VOTE_MIN_TRIED = 2;
/** Distinct network groups a family needs before its ranking is published. */
export const MIN_PUBLIC_TAGS = 12;
export const NONCE_RE = /^[0-9a-f]{32}$/;

export interface VotePayload {
  v: typeof VOTE_SCHEMA;
  device: VoteDevice;
  /** A control id, or 'tie' (Can't tell). */
  favorite: ControlId | 'tie';
  tried: ControlId[];
  /** The control flown last: a diagnostic only, never part of the tally. */
  last: ControlId;
  /** One random id per Send, kept until answered, so a resend can never count twice. */
  nonce: string;
}
export type VoteParse = { ok: true; vote: VotePayload } | { ok: false; status: 400 | 413 };

/**
 * One control's published row: ballots that picked it and ballots that tried it, each rounded down to a multiple of 5 (so no two
 * numbers add back up to the exact count of ballots, R2), and its head-to-head win percent (ballot-weighted, not head counts).
 */
export interface ControlResult { picked: number; tried: number; rate: number | null }
/** One family's tally. Below the public floor `ranked` is false and everything else but `votes` is null. */
export interface FamilyResults {
  votes: number; ranked: boolean; tie: number | null; order: ControlId[] | null; controls: Record<string, ControlResult> | null;
}
export interface VoteResults { v: typeof VOTE_SCHEMA; round: string; asOf: string; open: boolean; families: Record<VoteDevice, FamilyResults> }

const KEYS = ['v', 'device', 'favorite', 'tried', 'last', 'nonce'];
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** UTF-8 byte length without allocating a buffer. */
export function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** The lowercase media type before any parameters: 'Application/JSON; charset=utf-8' gives 'application/json'. */
export function mediaType(header: string | null | undefined): string {
  return (header ?? '').split(';')[0].trim().toLowerCase();
}

function validate(v: unknown): VotePayload | null {
  if (!isPlainObject(v)) return null;
  const own = Object.keys(v);
  if (own.length !== KEYS.length || !KEYS.every(k => own.includes(k))) return null;
  const { v: version, device, favorite, tried, last, nonce } = v;
  if (version !== VOTE_SCHEMA) return null;
  if (device !== 'touch' && device !== 'desktop') return null;
  if (typeof nonce !== 'string' || !NONCE_RE.test(nonce)) return null;
  if (!Array.isArray(tried) || tried.length < VOTE_MIN_TRIED || tried.length > controlsFor(device).length) return null;
  if (!tried.every(id => isControlFor(id, device)) || new Set(tried).size !== tried.length) return null;
  const ids = tried as ControlId[];
  if (!isControlFor(last, device) || !ids.includes(last)) return null;
  if (favorite !== 'tie' && !(isControlFor(favorite, device) && ids.includes(favorite))) return null;
  return { v: VOTE_SCHEMA, device, favorite: favorite as ControlId | 'tie', tried: [...ids], last, nonce };
}

/** Parse a raw request body. Over VOTE_MAX_BYTES gives 413; anything that is not exactly a valid vote gives 400. */
export function parseVote(text: string): VoteParse {
  if (typeof text !== 'string') return { ok: false, status: 400 };
  if (byteLength(text) > VOTE_MAX_BYTES) return { ok: false, status: 413 };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, status: 400 }; }
  const vote = validate(raw);
  return vote ? { ok: true, vote } : { ok: false, status: 400 };
}

// Sending the in-game vote (spec 3.2). Only the card's answers, touch or desktop, the build stamp and a random send code (so a
// retry is not counted twice) leave the device, and only when the player presses Send. Lab measurements, strokes and timings never do. Only a 200 marks the device as voted (B1).
import { CONTROL_TYPES, controlsFor, isControlFor, type ControlId } from '@/game/controlTypes';
import { cleanNote, VOTE_DEVICES, VOTE_SCHEMA, type VoteDevice, type VotePayload, type VoteRating, type VoteResults } from '@/lib/vote/shape';
import { BUILD_STAMP } from '@/ui/buildInfo';
import { markVoted, type VoteStorage } from './voteTracker';

export type VoteOutcome = 'ok' | 'later' | 'closed' | 'invalid' | 'network';
export type { VoteRating };
export const VOTE_URL = '/api/vote';
export const RESULTS_URL = '/api/results';
/** Display names, straight from the registry. */
export const VOTE_NAMES = Object.fromEntries(CONTROL_TYPES.map(c => [c.id, c.label])) as Record<ControlId, string>;

type FetchLike = (url: string, init?: RequestInit) => Promise<Pick<Response, 'status' | 'json'>>;
export interface SubmitOptions {
  fetch?: FetchLike; timeoutMs?: number; retryDelayMs?: number;
  /** Where the voted mark goes (default: localStorage), and the clock for it. */
  storage?: VoteStorage | null; now?: () => number;
}
export interface CardAnswers { favorite: ControlId; ratings: Partial<Record<ControlId, number>>; tried: readonly ControlId[]; note?: string }

const isRating = (v: unknown): v is VoteRating => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

/**
 * The payload is the card's answers and nothing else: v, favorite, ratings for tried controls, tried, device (the family), build,
 * cleaned note and a fresh send code (always, so the server's repeat-send guard always applies). Only this family's controls go.
 */
export function buildPayload(a: CardAnswers, device: VoteDevice, build = BUILD_STAMP, nonce = newNonce()): VotePayload {
  const tried = controlsFor(device).map(c => c.id).filter(id => id === a.favorite || a.tried.includes(id));
  const ratings: Partial<Record<ControlId, VoteRating>> = {};
  for (const id of tried) { const r = a.ratings[id]; if (isRating(r)) ratings[id] = r; }
  const payload: VotePayload = { v: VOTE_SCHEMA, favorite: a.favorite, ratings, tried, device, build: build.slice(0, 40), nonce };
  const note = typeof a.note === 'string' ? cleanNote(a.note) : '';
  if (note) payload.note = note;
  return payload;
}

/** Aborts after ms; AbortController + a clearable timer (AbortSignal.timeout cannot be cleared and is missing on older Safari). */
function deadline(ms: number): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController(), id = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, done: () => clearTimeout(id) };
}
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** A status that should be retried once (null: network error or timeout). */
const retryable = (status: number | null) => status === null || (status >= 500 && status !== 503);
function outcomeOf(status: number | null): VoteOutcome {
  if (status === 200) return 'ok';
  if (status === 429) return 'later';
  if (status === 503) return 'closed';
  if (retryable(status)) return 'network';
  return 'invalid';
}

async function postOnce(body: string, f: FetchLike, timeoutMs: number): Promise<number | null> {
  const d = deadline(timeoutMs);
  try {
    const res = await f(VOTE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: d.signal, credentials: 'same-origin', cache: 'no-store' });
    return res.status;
  } catch { return null; } finally { d.done(); }
}

/** A fresh id for one Send (crypto.randomUUID where there is one; else random hex). */
export function newNonce(): string {
  try { if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch { /* fall through */ }
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/**
 * 200 ok (marks voted) · 429 later (no mark, no retry) · 503 closed · 4xx invalid · network error/timeout/5xx: one retry, then
 * network. Both tries carry the same nonce, so a first try the server counted before its reply was lost is not counted again.
 */
export async function submitVote(payload: VotePayload, opts: SubmitOptions = {}): Promise<VoteOutcome> {
  const f = opts.fetch ?? ((url, init) => fetch(url, init)), timeoutMs = opts.timeoutMs ?? 6000;
  const body = JSON.stringify(payload);
  let status = await postOnce(body, f, timeoutMs);
  if (retryable(status)) { await wait(opts.retryDelayMs ?? 1000); status = await postOnce(body, f, timeoutMs); }
  const outcome = outcomeOf(status);
  if (outcome === 'ok') markVoted(payload.device, (opts.now ?? Date.now)(), opts.storage);
  return outcome;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Only the version-2 shape (a row group per family) is accepted; the old shape, or anything else, is null. */
const isResults = (d: unknown): d is VoteResults => isObj(d) && d.v === VOTE_SCHEMA && isObj(d.families)
  && VOTE_DEVICES.every(f => isObj(d.families) && isObj(d.families[f]) && isObj((d.families[f] as Record<string, unknown>).controls));

/** The running tally for the thanks line; any failure (or an unexpected shape) is null and the line is simply left out. */
export async function fetchResults(f: FetchLike = (url, init) => fetch(url, init), timeoutMs = 4000): Promise<VoteResults | null> {
  const d = deadline(timeoutMs);
  try {
    const res = await f(RESULTS_URL, { signal: d.signal, credentials: 'same-origin' });
    if (res.status !== 200) return null;
    const data: unknown = await res.json();
    return isResults(data) ? data : null;
  } catch { return null; } finally { d.done(); }
}

/** "Favorites so far on touch: Cursor 4 · Draw 2" (most first, zero counts left out), or '' when there is nothing to show. */
export function favoritesLine(r: VoteResults | null, family: VoteDevice): string {
  const rows = r?.families?.[family]?.controls;
  if (!rows) return '';
  const counts = controlsFor(family).map(c => [c.label, Number(rows[c.id]?.favorite) || 0] as const)
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return counts.length ? `Favorites so far on ${family}: ${counts.map(([label, n]) => `${label} ${n}`).join(' · ')}` : '';
}

// The card's pure model (tests/vote-card.test.ts).
/** The favorite choices: this family's tried controls, current first. With none tried, just the current control (or the whole family). */
export function favoriteOptions(tried: readonly ControlId[], current: ControlId, family: VoteDevice): ControlId[] {
  const own = controlsFor(family).map(c => c.id), list = own.filter(id => tried.includes(id));
  const base = list.length ? list : isControlFor(current, family) ? [current] : own;
  return base.includes(current) ? [current, ...base.filter(id => id !== current)] : base;
}
/** A rating group for each tried control only (same order as the favorites). */
export const ratingLabs = (tried: readonly ControlId[], current: ControlId, family: VoteDevice) =>
  favoriteOptions(tried, current, family).filter(id => tried.includes(id));
/** "Tried X of N" and the controls of the family not tried yet, in registry order. */
export function triedSummary(tried: readonly ControlId[], family: VoteDevice) {
  const all = controlsFor(family), left = all.filter(c => !tried.includes(c.id));
  return { count: all.length - left.length, of: all.length, left: left.map(c => c.label) };
}
export const canSend = (favorite: ControlId | null, busy: boolean, outcome: VoteOutcome | null) =>
  favorite !== null && !busy && outcome !== 'ok' && outcome !== 'closed';
/** The note counter counts code points, like the server's 280 cap. */
export const noteLength = (note: string) => Array.from(note).length;
export const STATUS_TEXT: Record<VoteOutcome, string> = {
  ok: 'Thanks, your vote is counted.',
  later: 'Too many votes from this network right now. Try again later.',
  closed: "Voting isn't open on this version yet.",
  invalid: 'Something went wrong with this vote. Reload the page and try again.',
  network: "Couldn't send. Try again?",
};

// Sending the in-game vote (spec 1.7, 1.8, 2.2). Six fields leave the device, only when the player presses Send: the way that felt best
// (or 'tie'), the ways tried, the one flown last, touch or desktop, and a random send code kept until the server answers (a resend
// counts once). Lab measurements, strokes and timings never do. Only a 200 marks the device as voted.
import { CONTROL_TYPES, controlsFor, isControlFor, type ControlId } from '@/game/controlTypes';
import { VOTE_DEVICES, VOTE_MIN_TRIED, VOTE_ROUND, VOTE_SCHEMA, type FamilyResults, type VoteDevice, type VotePayload, type VoteResults } from '@/lib/vote/ballot';
import { clearPending, savePending, type Pending } from './pending';
import { markVoted, type VoteStorage } from './voteTracker';

export type VoteOutcome = 'ok' | 'later' | 'closed' | 'cross' | 'invalid' | 'network' | 'error';
export const VOTE_URL = '/api/vote';
export const RESULTS_URL = '/api/results';
/** Display names, straight from the registry. */
export const VOTE_NAMES = Object.fromEntries(CONTROL_TYPES.map(c => [c.id, c.label])) as Record<ControlId, string>;

type FetchLike = (url: string, init?: RequestInit) => Promise<Pick<Response, 'status' | 'json'>>;
export interface SubmitOptions {
  fetch?: FetchLike; timeoutMs?: number; retryDelayMs?: number;
  /** Where the voted mark and the saved send code go (default: localStorage; null: none), and the clock for them. */
  storage?: VoteStorage | null; now?: () => number;
}
export type Probe = { results: VoteResults | null; closed: boolean };
export interface Answers { favorite: ControlId | 'tie'; tried: readonly ControlId[]; last: ControlId }

/** The payload is the card's answers and nothing else. `tried` is this family's controls in registry order, always including the pick and `last`. */
export function buildPayload(a: Answers, device: VoteDevice, nonce: string): VotePayload {
  const tried = controlsFor(device).map(c => c.id).filter(id => id === a.favorite || id === a.last || a.tried.includes(id));
  return { v: VOTE_SCHEMA, device, favorite: a.favorite, tried, last: a.last, nonce };
}

/** Aborts after ms; AbortController + a clearable timer (AbortSignal.timeout cannot be cleared and is missing on older Safari). */
function deadline(ms: number): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController(), id = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, done: () => clearTimeout(id) };
}
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Only a timeout or no connection (null) and a 408 are retried: a 502 is latched for 5 s by the server, so a 1 s retry would just be refused. */
const retryable = (status: number | null) => status === null || status === 408;
function outcomeOf(status: number | null): VoteOutcome {
  if (status === 200) return 'ok';
  if (status === 429) return 'later';
  if (status === 503) return 'closed';
  if (status === 403) return 'cross';
  if (status === 400 || status === 413 || status === 415) return 'invalid';
  return status === null || status === 408 ? 'network' : 'error';
}
async function postOnce(body: string, f: FetchLike, timeoutMs: number): Promise<number | null> {
  const d = deadline(timeoutMs);
  try {
    const res = await f(VOTE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: d.signal, credentials: 'same-origin', cache: 'no-store' });
    return res.status;
  } catch { return null; } finally { d.done(); }
}

/** 16 random bytes as 32 hex (crypto where there is one; else Math.random). */
export function newNonce(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fall through */ }
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/**
 * 7 s per attempt. 200 ok (marks voted, clears the saved code) · 429 later · 503 closed · 403 cross · 400/413/415 invalid (clears the
 * saved code) · timeout, offline or 408: one retry after 1 s, then network · any other status: error, never retried. Both tries carry
 * the same nonce, so a first try the server stored before its reply was lost is not counted again.
 */
export async function submitVote(payload: VotePayload, opts: SubmitOptions = {}): Promise<VoteOutcome> {
  const f = opts.fetch ?? ((url, init) => fetch(url, init)), timeoutMs = opts.timeoutMs ?? 7000;
  const body = JSON.stringify(payload);
  let status = await postOnce(body, f, timeoutMs);
  if (retryable(status)) { await wait(opts.retryDelayMs ?? 1000); status = await postOnce(body, f, timeoutMs); }
  const outcome = outcomeOf(status), now = (opts.now ?? Date.now)();
  if (outcome === 'ok') markVoted(payload.device, now, opts.storage);
  if (outcome === 'ok' || outcome === 'invalid') clearPending(payload.device, opts.storage, now);
  return outcome;
}
/** One press of Send: keep (or mint) the nonce, save the pick under it before the first request, then submit. The caller keeps the nonce for a resend. */
export async function castVote(a: Answers, device: VoteDevice, opts: SubmitOptions & { nonce?: string } = {}): Promise<{ outcome: VoteOutcome; nonce: string }> {
  const nonce = opts.nonce ?? newNonce(), payload = buildPayload(a, device, nonce);
  savePending(device, { nonce, favorite: payload.favorite, tried: payload.tried, last: payload.last } satisfies Pending, opts.storage, (opts.now ?? Date.now)());
  return { outcome: await submitVote(payload, opts), nonce };
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFamily = (f: unknown): f is FamilyResults => isObj(f) && typeof f.votes === 'number' && typeof f.ranked === 'boolean' && (f.order === null || Array.isArray(f.order));
/** Only the v3 shape of this round is accepted; anything else is unusable. */
const isResults = (d: unknown): d is VoteResults => isObj(d) && d.v === VOTE_SCHEMA && d.round === VOTE_ROUND && typeof d.open === 'boolean'
  && isObj(d.families) && VOTE_DEVICES.every(f => isFamily((d.families as Record<string, unknown>)[f]));

/** The open-time probe and the later tally are the one cached GET. closed: the server said 503 or open:false. Any failure is results null, closed false. */
export async function fetchResults(f: FetchLike = (url, init) => fetch(url, init), timeoutMs = 4000): Promise<Probe> {
  const d = deadline(timeoutMs), none: Probe = { results: null, closed: false };
  try {
    const res = await f(RESULTS_URL, { signal: d.signal, credentials: 'same-origin' });
    if (res.status === 503) return { results: null, closed: true };
    if (res.status !== 200) return none;
    const data: unknown = await res.json();
    return isResults(data) ? { results: data, closed: !data.open } : none;
  } catch { return none; } finally { d.done(); }
}

const TALLY_TAIL = 'The ranking shows once enough people have voted.';
/** The line under Send (never before it): the top three when ranked, a rounded count from 5 votes, otherwise no number; '' when there is no tally. */
export function tallyLine(r: VoteResults | null, family: VoteDevice): string {
  const f = r?.families?.[family];
  if (!f) return '';
  const top = (f.ranked && f.order ? f.order : []).filter(id => isControlFor(id, family)).slice(0, 3).map(id => VOTE_NAMES[id]);
  if (top.length) return `Winning head to head so far on ${family}: ${top.join(', ')}.`;
  return f.votes >= 5 ? `About ${f.votes} votes so far on ${family}. ${TALLY_TAIL}` : `Only a few votes so far on ${family}. ${TALLY_TAIL}`;
}

// The card's pure model (tests/vote-card.test.ts): which state shows, whether Send acts, and what it says.
export type Phase = 'need' | 'ballot' | 'done' | 'closed';
/** `counted`: tried controls at 20 s (the current control alone does not count). A vote already sent, or a 200, is done. */
export function cardPhase(a: { already: boolean; counted: number; outcome: VoteOutcome | null }): Phase {
  if (a.already || a.outcome === 'ok') return 'done';
  if (a.outcome === 'closed') return 'closed';
  return a.counted < VOTE_MIN_TRIED ? 'need' : 'ballot';
}
export const canSend = (pick: ControlId | 'tie' | null, busy: boolean, outcome: VoteOutcome | null) =>
  pick !== null && !busy && outcome !== 'ok' && outcome !== 'closed';
export const sendLabel = (busy: boolean, outcome: VoteOutcome | null) => busy ? 'Sending…' : outcome ? 'Try again' : 'Send vote';
/** A saved pick is offered again only while its control is still on the ballot. */
export const savedPick = (saved: Pending | null, offered: readonly ControlId[]): ControlId | 'tie' | null =>
  saved && (saved.favorite === 'tie' || offered.includes(saved.favorite)) ? saved.favorite : null;

export const SENDING_TEXT = 'Sending your vote.';
export const PICK_FIRST = 'Pick one way first.';
export const SAVED_TEXT = "Your last vote didn't send. Tap Send to try again.";
export const ALREADY_TEXT = 'Your vote is in. Thanks.';
export const PAUSED_TEXT = 'Voting may be paused. You can still try to send.';
export const STATUS_TEXT: Record<VoteOutcome, string> = {
  ok: 'Thanks. Your vote is in.',
  later: 'Voting is busy right now. Try again later.', // CODE-8: no "your pick is kept": with blocked storage a closed card keeps nothing
  closed: "Voting isn't open right now.",
  cross: 'Open the game at its own web address, then vote.',
  invalid: "This page can't send that vote. Reload the page and try again.",
  network: "Couldn't send. Tap Send to try again.",
  error: "Couldn't send. Tap Send to try again.",
};

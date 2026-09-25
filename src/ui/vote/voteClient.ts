// Sending the in-game vote (spec 3.2). Only the card's answers, touch or desktop, and the build stamp leave the device, and only
// when the player presses Send. Lab measurements, strokes and timings never do. Only a 200 marks the device as voted (B1).
import { cleanNote, isVoteLab, VOTE_LABS, type VoteDevice, type VoteLab, type VotePayload, type VoteRating, type VoteResults } from '@/lib/vote/shape';
import { BUILD_STAMP } from '@/ui/buildInfo';
import { markVoted, type VoteStorage } from './voteTracker';

export type VoteOutcome = 'ok' | 'later' | 'closed' | 'invalid' | 'network';
export type { VoteRating };
export const VOTE_URL = '/api/vote';
export const RESULTS_URL = '/api/results';
export const VOTE_NAMES: Record<VoteLab, string> = { standard: 'Standard', draw: 'Draw', conduct: 'Conduct', brush: 'Brush' };

type FetchLike = (url: string, init?: RequestInit) => Promise<Pick<Response, 'status' | 'json'>>;
export interface SubmitOptions {
  fetch?: FetchLike; timeoutMs?: number; retryDelayMs?: number;
  /** Where the voted mark goes (default: localStorage), and the clock for it. */
  storage?: VoteStorage | null; now?: () => number;
}
export interface CardAnswers { favorite: VoteLab; ratings: Partial<Record<VoteLab, number>>; tried: readonly VoteLab[]; note?: string }

const isRating = (v: unknown): v is VoteRating => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

/** The payload is the card's answers and nothing else: favorite, ratings for tried styles, tried, device, build, cleaned note. */
export function buildPayload(a: CardAnswers, device: VoteDevice, build = BUILD_STAMP): VotePayload {
  const tried = VOTE_LABS.filter(id => id === a.favorite || a.tried.includes(id));
  const ratings: Partial<Record<VoteLab, VoteRating>> = {};
  for (const id of tried) { const r = a.ratings[id]; if (isRating(r)) ratings[id] = r; }
  const payload: VotePayload = { favorite: a.favorite, ratings, tried, device, build: build.slice(0, 40) };
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

/** 200 ok (marks voted) · 429 later (no mark, no retry) · 503 closed · 4xx invalid · network error/timeout/5xx: one retry, then network. */
export async function submitVote(payload: VotePayload, opts: SubmitOptions = {}): Promise<VoteOutcome> {
  const f = opts.fetch ?? ((url, init) => fetch(url, init)), timeoutMs = opts.timeoutMs ?? 6000;
  const body = JSON.stringify(payload);
  let status = await postOnce(body, f, timeoutMs);
  if (retryable(status)) { await wait(opts.retryDelayMs ?? 1000); status = await postOnce(body, f, timeoutMs); }
  const outcome = outcomeOf(status);
  if (outcome === 'ok') markVoted((opts.now ?? Date.now)(), opts.storage);
  return outcome;
}

/** The running tally for the thanks line; any failure (or an unexpected shape) is null and the line is simply left out. */
export async function fetchResults(f: FetchLike = (url, init) => fetch(url, init), timeoutMs = 4000): Promise<VoteResults | null> {
  const d = deadline(timeoutMs);
  try {
    const res = await f(RESULTS_URL, { signal: d.signal, credentials: 'same-origin' });
    if (res.status !== 200) return null;
    const data: unknown = await res.json();
    return data !== null && typeof data === 'object' && typeof (data as VoteResults).favorite === 'object' ? data as VoteResults : null;
  } catch { return null; } finally { d.done(); }
}

/** "Favorites so far: Draw 4 · Standard 2" (most first, zero counts left out), or '' when there is nothing to show. */
export function favoritesLine(r: VoteResults | null): string {
  if (!r || !r.favorite) return '';
  const counts = VOTE_LABS.map(id => [id, Number((r.favorite as Record<string, unknown>)[id]) || 0] as const)
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return counts.length ? `Favorites so far: ${counts.map(([id, n]) => `${VOTE_NAMES[id]} ${n}`).join(' · ')}` : '';
}

// The card's pure model (tests/vote-card.test.ts).
/** The favorite choices: the tried styles (all four when none), current style first. */
export function favoriteOptions(tried: readonly VoteLab[], current: VoteLab): VoteLab[] {
  const list = tried.filter(isVoteLab);
  const base = list.length ? VOTE_LABS.filter(id => list.includes(id)) : [...VOTE_LABS];
  return base.includes(current) ? [current, ...base.filter(id => id !== current)] : base;
}
/** A rating group for each tried style only (same order as the favorites). */
export const ratingLabs = (tried: readonly VoteLab[], current: VoteLab) => favoriteOptions(tried, current).filter(id => tried.includes(id));
export const canSend = (favorite: VoteLab | null, busy: boolean, outcome: VoteOutcome | null) =>
  favorite !== null && !busy && outcome !== 'ok' && outcome !== 'closed';
/** The note counter counts code points, like the server's 280 cap. */
export const noteLength = (note: string) => Array.from(note).length;
export const STATUS_TEXT: Record<VoteOutcome, string> = {
  ok: 'Thanks, your vote is counted.',
  later: 'Too many votes from this network right now. Try again later.',
  closed: "Voting isn't open on this version yet.",
  invalid: 'Something went wrong with this vote.',
  network: "Couldn't send. Try again?",
};

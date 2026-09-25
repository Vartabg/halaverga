// The in-game vote's local bookkeeping (spec 3.2). Plain JSON in localStorage, every access wrapped: a missing, throwing or
// corrupt storage gives safe defaults (nothing played, never voted), so the card simply waits. Nothing here leaves the device.
import { VOTE_LABS, VOTE_ROUND, type VoteLab } from '@/lib/vote/shape';

export const PLAY_KEY = 'halaverga.vote.play.v1';
export const VOTE_KEY = 'halaverga.vote.v1';
export const TRIED_S = 30;
export const ELIGIBLE_TOTAL_S = 180;
export const ELIGIBLE_TRIED = 2;
export const LOCK_MS = 7 * 24 * 3600e3;
export const SKIP_QUIET_MS = 24 * 3600e3;
/** After an auto-open the card ignores pointers for this long, and until every pointer has lifted (m2). */
export const GUARD_MS = 400;
/** Safety cap: a pointerup the page never saw (the pointer left the window mid-press) cannot lock the card for good. */
export const GUARD_MAX_MS = 4000;

export type VoteStorage = Pick<Storage, 'getItem' | 'setItem'>;
export interface VotePlay { round: string; secs: Record<VoteLab, number> }
export interface VoteMark { round: string; at?: number; skippedAt?: number }

/** undefined: the page's localStorage (if reachable); null: no storage at all. */
function storageOf(s?: VoteStorage | null): VoteStorage | null {
  if (s !== undefined) return s;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
function readJson(s: VoteStorage | null, key: string): Record<string, unknown> | null {
  try {
    const raw = s?.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}
function writeJson(s: VoteStorage | null, key: string, value: unknown) {
  try { s?.setItem(key, JSON.stringify(value)); } catch { /* Private browsing may refuse storage; the vote still works once. */ }
}
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const zeroSecs = () => Object.fromEntries(VOTE_LABS.map(id => [id, 0])) as Record<VoteLab, number>;

export function emptyPlay(round = VOTE_ROUND): VotePlay { return { round, secs: zeroSecs() }; }

/** The saved play time for this round; another round (or anything unreadable) starts from zero. */
export function readPlay(storage?: VoteStorage | null, round = VOTE_ROUND): VotePlay {
  const o = readJson(storageOf(storage), PLAY_KEY), play = emptyPlay(round);
  if (!o || o.round !== round || o.secs === null || typeof o.secs !== 'object') return play;
  const secs = o.secs as Record<string, unknown>;
  for (const id of VOTE_LABS) { const v = secs[id]; if (finite(v) && (v as number) > 0) play.secs[id] = Math.min(v as number, 1e7); }
  return play;
}
export function savePlay(play: VotePlay, storage?: VoteStorage | null) { writeJson(storageOf(storage), PLAY_KEY, play); }

/** Adds played seconds to one style (in place; the layer saves every 10 s and on pagehide). */
export function tick(play: VotePlay, lab: VoteLab, secs = 1): VotePlay {
  if (VOTE_LABS.includes(lab) && finite(secs) && secs > 0) play.secs[lab] += Math.min(secs, 60);
  return play;
}
export const totalSecs = (play: VotePlay) => VOTE_LABS.reduce((sum, id) => sum + play.secs[id], 0);

/** Styles played for 30 s or more, in the fixed order, plus the current style (the card always offers what you are playing). */
export function tried(play: VotePlay, current?: VoteLab): VoteLab[] {
  return VOTE_LABS.filter(id => play.secs[id] >= TRIED_S || id === current);
}

export function readMark(storage?: VoteStorage | null, round = VOTE_ROUND): VoteMark {
  const o = readJson(storageOf(storage), VOTE_KEY);
  if (!o || o.round !== round) return { round };
  const mark: VoteMark = { round };
  if (finite(o.at)) mark.at = o.at as number;
  if (finite(o.skippedAt)) mark.skippedAt = o.skippedAt as number;
  return mark;
}

/** One vote per device per round, for 7 days: a new round (or the lock running out) opens voting again. */
export function canVote(mark: VoteMark, now: number, round = VOTE_ROUND): boolean {
  if (mark.round !== round || mark.at === undefined) return true;
  return !(now - mark.at < LOCK_MS && now >= mark.at);
}

/** Auto-open only for someone who compared: two styles of 30 s or more, 3 minutes in all, no vote yet, no Skip in 24 h. */
export function eligible(play: VotePlay, mark: VoteMark, now: number, round = VOTE_ROUND): boolean {
  if (play.round !== round || !canVote(mark, now, round)) return false;
  if (mark.round === round && mark.skippedAt !== undefined && now - mark.skippedAt < SKIP_QUIET_MS && now >= mark.skippedAt) return false;
  return tried(play).length >= ELIGIBLE_TRIED && totalSecs(play) >= ELIGIBLE_TOTAL_S;
}

export function markVoted(now = Date.now(), storage?: VoteStorage | null, round = VOTE_ROUND) {
  const s = storageOf(storage), mark = readMark(s, round);
  writeJson(s, VOTE_KEY, { ...mark, round, at: now });
}
export function markSkipped(now = Date.now(), storage?: VoteStorage | null, round = VOTE_ROUND) {
  const s = storageOf(storage), mark = readMark(s, round);
  writeJson(s, VOTE_KEY, { ...mark, round, skippedAt: now });
}

/** The auto-open pointer guard: on until 400 ms have passed AND no pointer is down (capped at GUARD_MAX_MS). */
export function guardOn(openedAt: number, now: number, activePointers: number): boolean {
  const age = now - openedAt;
  if (!(age >= 0) || age >= GUARD_MAX_MS) return false;
  return age < GUARD_MS || activePointers > 0;
}

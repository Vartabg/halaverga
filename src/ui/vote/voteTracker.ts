// The in-game vote's local bookkeeping (spec 3.2). Plain JSON in localStorage, every access wrapped: a missing, throwing or
// corrupt storage gives safe defaults (nothing played, never voted), so the card simply waits. Nothing here leaves the device.
// Play time is kept per control and family (controlKey: 'touch:draw' and 'desktop:draw' are separate). Only seconds in which the
// player gave input count (VoteLayer decides with inputRecent and the held-key set), so merely opening the sheet accrues nothing.
import { CONTROL_FAMILIES, controlKey, controlsFor, type ControlFamily, type ControlId } from '@/game/controlTypes';
import { VOTE_MIN_TRIED, VOTE_ROUND } from '@/lib/vote/ballot';

export const PLAY_KEY = 'halaverga.vote.play.v2';
export const VOTE_KEY = 'halaverga.vote.v1';
/** Seconds of played input on one control before it counts as tried. */
export const TRIED_S = 20;
/** The last input within this many ms keeps a second counted as played. */
export const INPUT_WINDOW_MS = 2000;
export const LOCK_MS = 7 * 24 * 3600e3;
export const SKIP_QUIET_MS = 24 * 3600e3;
/** After an auto-open the card ignores pointers for this long, and until every pointer has lifted (m2). */
export const GUARD_MS = 400;
/** Safety cap: a pointerup the page never saw (the pointer left the window mid-press) cannot lock the card for good. */
export const GUARD_MAX_MS = 4000;

export type VoteStorage = Pick<Storage, 'getItem' | 'setItem'>;
/** Seconds played, by controlKey(family, id); every key of both families is always present. */
export interface VotePlay { round: string; secs: Record<string, number> }
/** When this family's vote was sent and when its card was last skipped. A touch laptop or iPad can vote once per family. */
export interface FamilyMark { at?: number; skippedAt?: number }
export interface VoteMark { round: string; touch?: FamilyMark; desktop?: FamilyMark }

/** undefined: the page's localStorage (if reachable); null: no storage at all. */
export function storageOf(s?: VoteStorage | null): VoteStorage | null {
  if (s !== undefined) return s;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export function readJson(s: VoteStorage | null, key: string): Record<string, unknown> | null {
  try {
    const raw = s?.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}
export function writeJson(s: VoteStorage | null, key: string, value: unknown) {
  try { s?.setItem(key, JSON.stringify(value)); } catch { /* Private browsing may refuse storage; the vote still works once. */ }
}
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const ALL_KEYS = CONTROL_FAMILIES.flatMap(f => controlsFor(f).map(c => controlKey(f, c.id)));
const zeroSecs = () => Object.fromEntries(ALL_KEYS.map(k => [k, 0])) as Record<string, number>;

export function emptyPlay(round = VOTE_ROUND): VotePlay { return { round, secs: zeroSecs() }; }

/** The saved play time for this round; another round (or anything unreadable) starts from zero. */
export function readPlay(storage?: VoteStorage | null, round = VOTE_ROUND): VotePlay {
  const o = readJson(storageOf(storage), PLAY_KEY), play = emptyPlay(round);
  if (!o || o.round !== round || o.secs === null || typeof o.secs !== 'object') return play;
  const secs = o.secs as Record<string, unknown>;
  for (const k of ALL_KEYS) { const v = secs[k]; if (finite(v) && (v as number) > 0) play.secs[k] = Math.min(v as number, 1e7); }
  return play;
}
export function savePlay(play: VotePlay, storage?: VoteStorage | null) { writeJson(storageOf(storage), PLAY_KEY, play); }

/** Adds played seconds to one control key (in place; the layer saves every 10 s and on pagehide). Unknown keys are ignored. */
export function tick(play: VotePlay, key: string, secs = 1): VotePlay {
  if (key in play.secs && finite(secs) && secs > 0) play.secs[key] += Math.min(secs, 60);
  return play;
}
/** Controls of the family played for TRIED_S or more, in registry order, plus the current one (the card always offers what you are playing). */
export function triedIds(play: VotePlay, family: ControlFamily, current?: ControlId): ControlId[] {
  return controlsFor(family).filter(c => play.secs[controlKey(family, c.id)] >= TRIED_S || c.id === current).map(c => c.id);
}

/** The one in-memory play record (loaded once from storage), shared by the layer's tick, the sheet and the settings section. */
let live: VotePlay | null = null;
export const livePlay = (): VotePlay => (live ??= readPlay());

/** True when the last game input at `lastAt` is within the window: 1999 ms yes, 2001 ms no. Never for a missing input time. */
export const inputRecent = (lastAt: number, now: number, windowMs = INPUT_WINDOW_MS): boolean =>
  finite(lastAt) && finite(now) && now >= lastAt && now - lastAt <= windowMs;

function readFamilyMark(v: unknown): FamilyMark | undefined {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>, m: FamilyMark = {};
  if (finite(o.at)) m.at = o.at as number;
  if (finite(o.skippedAt)) m.skippedAt = o.skippedAt as number;
  return m.at === undefined && m.skippedAt === undefined ? undefined : m;
}
export function readMark(storage?: VoteStorage | null, round = VOTE_ROUND): VoteMark {
  const o = readJson(storageOf(storage), VOTE_KEY);
  if (!o || o.round !== round) return { round };
  const mark: VoteMark = { round };
  for (const f of CONTROL_FAMILIES) { const m = readFamilyMark(o[f]); if (m) mark[f] = m; }
  return mark;
}

/** One vote per family per device per round, for 7 days: a new round (or the lock running out) opens voting again. */
export function canVote(mark: VoteMark, now: number, family: ControlFamily, round = VOTE_ROUND): boolean {
  const at = mark.round === round ? mark[family]?.at : undefined;
  if (at === undefined) return true;
  return !(now - at < LOCK_MS && now >= at);
}

/** Tried controls the pause-card nudge and the auto-open need: two, the ballot's minimum (a vote compares at least two ways of flying). */
export const NUDGE_TRIED = () => VOTE_MIN_TRIED;
export const autoNeed = () => VOTE_MIN_TRIED;

/**
 * Asked to vote: `need` tried controls of this family (20 s each; no total-play rule), no vote yet, no Skip in the last 24 h.
 * Only the family's own keys count, so two tried touch controls never make a desktop player eligible.
 */
export function eligible(play: VotePlay, mark: VoteMark, now: number, family: ControlFamily, need: number, round = VOTE_ROUND): boolean {
  if (play.round !== round || !canVote(mark, now, family, round)) return false;
  const skippedAt = mark.round === round ? mark[family]?.skippedAt : undefined;
  if (skippedAt !== undefined && now - skippedAt < SKIP_QUIET_MS && now >= skippedAt) return false;
  return triedIds(play, family).length >= need;
}

/** Adds one field to this family's mark and keeps the other family's mark and the rest of this one. */
function writeMark(family: ControlFamily, field: keyof FamilyMark, now: number, storage: VoteStorage | null | undefined, round: string) {
  const s = storageOf(storage), mark = readMark(s, round);
  writeJson(s, VOTE_KEY, { ...mark, round, [family]: { ...mark[family], [field]: now } });
}
export const markVoted = (family: ControlFamily, now = Date.now(), storage?: VoteStorage | null, round = VOTE_ROUND) => writeMark(family, 'at', now, storage, round);
export const markSkipped = (family: ControlFamily, now = Date.now(), storage?: VoteStorage | null, round = VOTE_ROUND) => writeMark(family, 'skippedAt', now, storage, round);

/** Only a Skip on an auto-open records the 24 h quiet (VoteLayer): a manual Not yet or Escape, from a card the visitor opened, records nothing. */
export const skipCounts = (kind: 'skip' | 'done', origin: 'auto' | 'pause') => kind === 'skip' && origin === 'auto';

/** The auto-open pointer guard: on until 400 ms have passed AND no pointer is down (capped at GUARD_MAX_MS). */
export function guardOn(openedAt: number, now: number, activePointers: number): boolean {
  const age = now - openedAt;
  if (!(age >= 0) || age >= GUARD_MAX_MS) return false;
  return age < GUARD_MS || activePointers > 0;
}

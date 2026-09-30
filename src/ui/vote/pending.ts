// A vote that was pressed but not yet answered (spec 1.8). One send code (nonce) per Send, kept until the server answers, so a lost
// reply, a reopened card or a reload resends the same code and the vote can never count twice. Saved before the first request, cleared
// by a 200 or a 400/413/415, and dropped after 24 h. Every access is wrapped: with no usable storage there is simply nothing saved.
import type { ControlId } from '@/game/controlTypes';
import { validateVote, VOTE_ROUND, VOTE_SCHEMA, type VoteDevice } from '@/lib/vote/ballot';
import { readJson, storageOf, writeJson, type VoteStorage } from './voteTracker';

export const PENDING_KEY = 'halaverga.vote.pending';
export const PENDING_MS = 24 * 3600e3;
export interface Pending { nonce: string; favorite: ControlId | 'tie'; tried: ControlId[]; last: ControlId }
const FAMILIES: readonly VoteDevice[] = ['touch', 'desktop'];

/** One family's saved entry, or null when it is missing, malformed, from another round, older than 24 h or from the future. */
function entryOf(v: unknown, family: VoteDevice, now: number): Pending | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>, { at } = o;
  if (typeof at !== 'number' || !Number.isFinite(at) || now < at || now - at >= PENDING_MS) return null;
  const ok = validateVote({ v: VOTE_SCHEMA, device: family, favorite: o.favorite, tried: o.tried, last: o.last, nonce: o.nonce }); // CODE-9: the one vote check, not a copy
  return ok ? { nonce: ok.nonce, favorite: ok.favorite, tried: ok.tried, last: ok.last } : null;
}

export function readPending(family: VoteDevice, storage?: VoteStorage | null, now: number = Date.now()): Pending | null {
  const o = readJson(storageOf(storage), PENDING_KEY);
  return o && o.round === VOTE_ROUND ? entryOf(o[family], family, now) : null;
}

/** The raw record of the current round with only still-valid entries (so an old family entry is dropped whenever another is written). */
function current(s: VoteStorage | null, now: number): Record<string, unknown> {
  const o = readJson(s, PENDING_KEY), kept: Record<string, unknown> = { round: VOTE_ROUND };
  if (o && o.round === VOTE_ROUND) for (const f of FAMILIES) if (entryOf(o[f], f, now)) kept[f] = o[f];
  return kept;
}
export function savePending(family: VoteDevice, entry: Pending, storage?: VoteStorage | null, now: number = Date.now()) {
  const s = storageOf(storage);
  writeJson(s, PENDING_KEY, { ...current(s, now), [family]: { nonce: entry.nonce, favorite: entry.favorite, tried: entry.tried, last: entry.last, at: now } });
}
export function clearPending(family: VoteDevice, storage?: VoteStorage | null, now: number = Date.now()) {
  const s = storageOf(storage), kept = current(s, now);
  delete kept[family];
  writeJson(s, PENDING_KEY, kept);
}

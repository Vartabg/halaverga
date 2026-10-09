// The ballot's order and the "try one more" suggestion (spec 1.4, 1.5). Both read one per-device seed, so a visitor sees the same
// order every time and adding a tried control never reshuffles the rows already there. Pure apart from readSeed's storage access.
import { controlsFor, isControlFor, type ControlId } from '@/game/controlTypes';
import type { VoteDevice } from '@/lib/vote/ballot';
import { storageOf, type VoteStorage } from './voteTracker';

export const SEED_KEY = 'halaverga.vote.seed';
/** Trackpad-specific or pointer-capturing controls: never suggested, they stay opt-in. */
export const SUGGEST_SKIP: readonly ControlId[] = ['flow', 'captured', 'mouse-keys'];

/** mulberry32: a small seeded generator, the same numbers for the same seed on every device. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Fisher-Yates from the seed; the input is left alone. */
export function shuffleIds<T>(ids: readonly T[], seed: number): T[] {
  const out = [...ids], next = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const shuffledFamily = (family: VoteDevice, seed: number) => shuffleIds(controlsFor(family).map(c => c.id), seed);

/**
 * The rows of the ballot: `offered` (the family's controls only, each once) in this visitor's shuffled order. `current`, the control
 * being flown, is moved off the top when the shuffle would put it first. `Can't tell` is added by the view, always last.
 */
export function ballotOptions(offered: readonly ControlId[], family: VoteDevice, seed: number, current?: ControlId): ControlId[] {
  const rows = shuffledFamily(family, seed).filter(id => offered.includes(id) && isControlFor(id, family));
  if (rows.length > 1 && rows[0] === current) [rows[0], rows[1]] = [rows[1], rows[0]];
  return rows;
}

/** The first control of the family not yet tried, in the seeded order, skipping SUGGEST_SKIP; null when none is left. */
export function suggestNext(family: VoteDevice, tried: readonly ControlId[], seed: number): ControlId | null {
  return shuffledFamily(family, seed).find(id => !tried.includes(id) && !SUGGEST_SKIP.includes(id)) ?? null;
}

const SEED_RE = /^\d{1,10}$/;
function randomSeed(): number {
  try { if (typeof crypto !== 'undefined') return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { /* fall through */ }
  return Math.floor(Math.random() * 4294967296);
}
let inMemory: number | null = null;
/** This device's seed (an integer in localStorage): saved once, so the order is stable. Without usable storage it is fresh per page load, and never throws. */
export function readSeed(storage?: VoteStorage | null): number {
  const s = storageOf(storage);
  try {
    const raw = s?.getItem(SEED_KEY);
    if (raw && SEED_RE.test(raw) && Number(raw) <= 0xffffffff) return Number(raw);
  } catch { /* fall through to a fresh seed */ }
  const seed = inMemory ?? (inMemory = randomSeed());
  try { s?.setItem(SEED_KEY, String(seed)); } catch { /* the seed then lasts for this page load only */ }
  return seed;
}

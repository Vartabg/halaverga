// Gesture Lab local telemetry (spec 11). Pure accumulators over one plain JSON record, saved under LAB_STATS_KEY through an
// injectable storage (localStorage by default). Every storage access is wrapped: a missing or throwing storage leaves an empty,
// render-safe record. The numbers stay on this device; nothing here sends them anywhere.
import { gesture } from '@/game/gesture/bus';
import { LAB_STATS_KEY } from '@/game/gesture/tuning';
import type { StrokeKind } from '@/game/gesture/types';

export type LabId = 'standard' | 'draw' | 'conduct' | 'brush';
export const LAB_IDS: readonly LabId[] = ['standard', 'draw', 'conduct', 'brush'];
export const LAB_NAMES: Record<LabId, string> = { standard: 'Standard', draw: 'Draw', conduct: 'Conduct', brush: 'Brush' };
export type StatStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KINDS: readonly StrokeKind[] = ['none', 'tap', 'hold', 'flick', 'swipe', 'circle', 'lasso', 'nudge'];
export const COUNTERS = ['taps', 'hits', 'kills', 'overheats', 'truncations', 'drawDone', 'landings', 'clearance',
  'pointerCancels', 'edgeRejects', 'bottomRejects', 'pauses'] as const;
export type Counter = typeof COUNTERS[number];
/** Frame-time histogram: 1 ms bins; the last bin also collects every longer frame. */
export const FRAME_BINS = 64;
const REASON = /^[a-z][a-z-]{0,23}$/i;

export interface SchemeStats {
  /** Played milliseconds (paused time excluded). */
  ms: number;
  attempts: number;
  recognised: Record<StrokeKind, number>; rejected: Record<StrokeKind, number>;
  latencySum: number; latencyN: number;
  counts: Record<Counter, number>;
  /** Draw aborts by reason (pathFollow's reason names). */
  aborts: Record<string, number>;
  /** Time-weighted speed sum (m/s x ms) and the peak, m/s. */
  speedSum: number; speedMax: number;
  frames: number[];
  /** Played ms at the first recognised gesture, -1 before it. */
  firstSuccessMs: number;
  /** Optional 1-5 ratings; 0 = not rated. */
  beauty: number; control: number;
}
export interface LabStats { v: 1; schemes: Record<LabId, SchemeStats> }

const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>;
export function emptyScheme(): SchemeStats {
  return { ms: 0, attempts: 0, recognised: zeros(KINDS), rejected: zeros(KINDS), latencySum: 0, latencyN: 0, counts: zeros(COUNTERS),
    aborts: {}, speedSum: 0, speedMax: 0, frames: new Array<number>(FRAME_BINS).fill(0), firstSuccessMs: -1, beauty: 0, control: 0 };
}
export function emptyStats(): LabStats {
  return { v: 1, schemes: { standard: emptyScheme(), draw: emptyScheme(), conduct: emptyScheme(), brush: emptyScheme() } };
}

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
const rating = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function merge(into: Record<string, number>, from: unknown, open = false) {
  if (!isObj(from)) return;
  const keys = open ? Object.keys(from).filter(k => REASON.test(k)).slice(0, 24) : Object.keys(into);
  for (const k of keys) into[k] = num(from[k]);
}
/** Rebuilds a saved record on a fresh template: unknown fields are dropped and bad numbers become 0. */
export function revive(raw: unknown): LabStats {
  const out = emptyStats();
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.schemes)) return out;
  for (const id of LAB_IDS) {
    const r = raw.schemes[id];
    if (!isObj(r)) continue;
    const s = out.schemes[id];
    s.ms = num(r.ms); s.attempts = num(r.attempts); s.latencySum = num(r.latencySum); s.latencyN = num(r.latencyN);
    s.speedSum = num(r.speedSum); s.speedMax = num(r.speedMax);
    s.firstSuccessMs = typeof r.firstSuccessMs === 'number' && r.firstSuccessMs >= 0 ? r.firstSuccessMs : -1;
    s.beauty = rating(r.beauty); s.control = rating(r.control);
    merge(s.recognised, r.recognised); merge(s.rejected, r.rejected); merge(s.counts, r.counts); merge(s.aborts, r.aborts, true);
    if (Array.isArray(r.frames)) for (let i = 0; i < FRAME_BINS; i++) s.frames[i] = num(r.frames[i]);
  }
  return out;
}

export function defaultStorage(): StatStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export function loadStats(storage: StatStorage | null = defaultStorage()): LabStats {
  try { const text = storage?.getItem(LAB_STATS_KEY); return text ? revive(JSON.parse(text)) : emptyStats(); } catch { return emptyStats(); }
}
export function saveStats(st: LabStats, storage: StatStorage | null = defaultStorage()): boolean {
  try { if (!storage) return false; storage.setItem(LAB_STATS_KEY, JSON.stringify(st)); return true; } catch { return false; }
}
export function clearStats(storage: StatStorage | null = defaultStorage()): LabStats {
  try { storage?.removeItem(LAB_STATS_KEY); } catch { /* a blocked storage keeps its copy; the live record still resets */ }
  return emptyStats();
}
export const exportStats = (st: LabStats) => JSON.stringify(st, null, 2);

// Accumulators. recordFrame runs every animation frame and allocates nothing.
export function recordFrame(st: LabStats, id: LabId, dtMs: number, speed: number) {
  if (!(dtMs > 0) || dtMs > 1000) return; // a hidden tab or a resume gap is not play
  const s = st.schemes[id], v = Number.isFinite(speed) && speed > 0 ? speed : 0;
  s.ms += dtMs; s.speedSum += v * dtMs;
  if (v > s.speedMax) s.speedMax = v;
  s.frames[Math.min(FRAME_BINS - 1, Math.floor(dtMs))]++;
}
/** One finished stroke: recognised (ok) or rejected, by kind, with its recognition latency in ms (negative = unknown). */
export function recordStroke(st: LabStats, id: LabId, kind: StrokeKind, ok: boolean, latencyMs: number) {
  const s = st.schemes[id];
  s.attempts++;
  (ok ? s.recognised : s.rejected)[kind]++;
  if (Number.isFinite(latencyMs) && latencyMs >= 0) { s.latencySum += latencyMs; s.latencyN++; }
  if (ok && s.firstSuccessMs < 0) s.firstSuccessMs = s.ms;
}
export function count(st: LabStats, id: LabId, key: Counter, n = 1) { st.schemes[id].counts[key] += n; }
export function recordAbort(st: LabStats, id: LabId, reason: string) {
  if (!REASON.test(reason)) return;
  const a = st.schemes[id].aborts;
  a[reason] = (a[reason] ?? 0) + 1;
}
/** Saves the ratings that were given (1-5); a 0 leaves the earlier answer. */
export function rate(st: LabStats, id: LabId, beauty: number, control: number) {
  const s = st.schemes[id];
  if (rating(beauty)) s.beauty = beauty;
  if (rating(control)) s.control = control;
}
/** Upper edge of the frame-time bin holding quantile q, in ms; -1 with no frames. */
export function percentile(frames: readonly number[], q: number): number {
  let total = 0;
  for (let i = 0; i < frames.length; i++) total += frames[i];
  if (!total) return -1;
  for (let i = 0, acc = 0; i < frames.length; i++) { acc += frames[i]; if (acc >= q * total) return i + 1; }
  return frames.length;
}

/** What LabControls reads each frame; the edges (a new overheat, a landing) are counted here so they are testable. */
export interface FrameProbe { hits: number; kills: number; presses: number; gestureFire: boolean; locked: boolean; clearance: boolean; flying: boolean }
export const createProbe = (): FrameProbe => ({ hits: 0, kills: 0, presses: 0, gestureFire: false, locked: false, clearance: false, flying: false });
/** Counts what changed from prev to now, then copies now into prev. A tap is a new press while 'gesture' owns the trigger. */
export function sampleProbe(st: LabStats, id: LabId, prev: FrameProbe, now: FrameProbe) {
  const c = st.schemes[id].counts;
  if (now.hits > prev.hits) c.hits += now.hits - prev.hits;
  if (now.kills > prev.kills) c.kills += now.kills - prev.kills;
  if (now.gestureFire && now.presses > prev.presses) c.taps += now.presses - prev.presses;
  if (now.locked && !prev.locked) { c.overheats++; if (prev.gestureFire || now.gestureFire) c.truncations++; }
  if (now.clearance && !prev.clearance) c.clearance++;
  if (prev.flying && !now.flying) c.landings++;
  Object.assign(prev, now);
}

/** The side-by-side table: one row per metric, one value per LAB_IDS column. */
export interface StatRow { label: string; values: string[] }
const DASH = '—';
const per = (a: number, b: number, d = 0) => b > 0 ? (a / b).toFixed(d) : DASH;
const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const listed = (r: Record<string, number>) => Object.entries(r).filter(e => e[1] > 0).map(([k, v]) => `${k} ${v}`).join(', ') || DASH;
const ms = (v: number) => v < 0 ? DASH : String(v);
const METRICS: [string, (s: SchemeStats) => string][] = [
  ['Minutes played', s => (s.ms / 60000).toFixed(1)],
  ['Gestures tried', s => String(s.attempts)],
  ['Recognised', s => s.attempts ? `${Math.round(100 * total(s.recognised) / s.attempts)}%` : DASH],
  ['Recognised by kind', s => listed(s.recognised)],
  ['Rejected by kind', s => listed(s.rejected)],
  ['Recognition ms', s => per(s.latencySum, s.latencyN)],
  ['Taps', s => String(s.counts.taps)], ['Hits', s => String(s.counts.hits)], ['Kills', s => String(s.counts.kills)],
  ['Overheats', s => String(s.counts.overheats)], ['Burst truncations', s => String(s.counts.truncations)],
  ['Draw completions', s => String(s.counts.drawDone)], ['Draw aborts', s => listed(s.aborts)],
  ['Landings', s => String(s.counts.landings)],
  ['Clearance / min', s => per(s.counts.clearance, s.ms / 60000, 1)],
  ['Mean speed m/s', s => per(s.speedSum, s.ms, 1)], ['Max speed m/s', s => s.ms > 0 ? s.speedMax.toFixed(1) : DASH],
  ['Frame p50 ms', s => ms(percentile(s.frames, 0.5))], ['Frame p95 ms', s => ms(percentile(s.frames, 0.95))],
  ['Pointer cancels', s => String(s.counts.pointerCancels)], ['Edge rejects', s => String(s.counts.edgeRejects)],
  ['Bottom-band rejects', s => String(s.counts.bottomRejects)], ['Unexpected pauses', s => String(s.counts.pauses)],
  ['First success s', s => s.firstSuccessMs < 0 ? DASH : (s.firstSuccessMs / 1000).toFixed(1)],
  ['How beautiful?', s => s.beauty ? `${s.beauty}/5` : DASH], ['How in control?', s => s.control ? `${s.control}/5` : DASH],
];
export function statsTable(st: LabStats): StatRow[] {
  return METRICS.map(([label, f]) => ({ label, values: LAB_IDS.map(id => f(st.schemes[id])) }));
}

// The live record for hosts that only know "a thing happened now" (surface rejects, pathFollow aborts). Loaded on first use.
let live: LabStats | null = null;
export const labStats = (storage?: StatStorage | null): LabStats => live ??= loadStats(storage);
export const currentLab = (): LabId => gesture.scheme === 'off' ? 'standard' : gesture.scheme;
export function noteLab(key: Counter, n = 1) { count(labStats(), currentLab(), key, n); }
export function noteAbort(reason: string) { recordAbort(labStats(), currentLab(), reason); }
export function flushLabStats(storage?: StatStorage | null) { return live ? saveStats(live, storage) : false; }
export function resetLabStats(storage?: StatStorage | null) { return live = clearStats(storage); }

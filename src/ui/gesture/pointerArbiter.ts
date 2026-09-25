// Gesture Lab pointer arbiter (spec 2.1, the 2.6 table): a pure reducer (no DOM, no allocation after create) that GestureSurface feeds.
// The owner strokes, arms, holds or looks; a second pointer's role is fixed on down (drone: instant burst, else a tap brakes); a third
// is ignored; a stale-epoch pointer is dead until it lifts. Mouse follows the desktop table (click-to-ink), touch/pen the phone table.
import type { ArbiterEvent, ArbiterOut, ArbiterOutType, PointerKind, Scheme } from '@/game/gesture/types';
import { BRAKE_HOLD_MS, HOLD_MS, REST_COMMIT_MIN_PX, REST_COMMIT_MS, SUSTAIN_MS, TAP_MS, TAP_SLOP_MOUSE, TAP_SLOP_TOUCH } from '@/game/gesture/tuning';
export type LabId = Scheme['id'];
type Role = 'free' | 'pending' | 'hold' | 'armed' | 'sustain' | 'stroke' | 'look' | 'tap2' | 'spent';
interface Slot { id: number; role: Role; kind: PointerKind; epoch: number; x0: number; y0: number; t0: number;
  x: number; y: number; t: number; travel: number; drone: number; guide: boolean }
/** Touch start filter in client px: the box origin and size plus the rejected margins (side strips, header band, bottom band). */
export interface StartZone { x: number; y: number; width: number; height: number; left: number; right: number; top: number; bottom: number }
/** pick: the drone under the point (tapBlast.pick) or -1. blaster(): an empty tap fires a miss. zone.width 0: not measured, no filter. */
export interface ArbiterConfig { scheme: LabId; pick(x: number, y: number, t: number): number; blaster(): boolean; zone: StartZone }
export type InkMode = 'idle' | 'inking' | 'committing';
interface Ink { mode: InkMode; id: number; epoch: number; arc: number; x: number; y: number; restX: number; restY: number; restT: number; guide: boolean }
export interface Arbiter { cfg: ArbiterConfig; owner: Slot; second: Slot; ink: Ink; out: ArbiterOut[]; n: number; rejects: number }
export const REJECT_EDGE = 0, REJECT_HEADER = 1, REJECT_BOTTOM = 2; // a 'reject' output carries its reason in drone
const OUT_CAP = 8;
const slot = (): Slot => ({ id: -1, role: 'free', kind: 'touch', epoch: 0, x0: 0, y0: 0, t0: 0, x: 0, y: 0, t: 0, travel: 0, drone: -1, guide: false });
export function createArbiter(cfg: ArbiterConfig): Arbiter {
  const out: ArbiterOut[] = [];
  for (let i = 0; i < OUT_CAP; i++) out.push({ type: 'none', id: -1, x: 0, y: 0, t: 0, drone: -1, progress: 0 });
  return { cfg, owner: slot(), second: slot(), out, n: 0, rejects: 0,
    ink: { mode: 'idle', id: -1, epoch: 0, arc: 0, x: 0, y: 0, restX: 0, restY: 0, restT: 0, guide: false } };
}
function emit(a: Arbiter, type: ArbiterOutType, id: number, x: number, y: number, t: number, drone = -1, progress = 0) {
  if (a.n < OUT_CAP) { const o = a.out[a.n++]; o.type = type; o.id = id; o.x = x; o.y = y; o.t = t; o.drone = drone; o.progress = progress; }
}
const slop = (k: PointerKind) => k === 'mouse' ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH;
const desk = (s: Slot) => s.kind === 'mouse';
const isTap = (s: Slot) => s.travel <= slop(s.kind) && s.t - s.t0 <= TAP_MS;
const live = (s: Slot) => s.role !== 'free' && s.role !== 'spent';
function find(a: Arbiter, id: number): Slot | null {
  if (a.owner.role !== 'free' && a.owner.id === id) return a.owner;
  return a.second.role !== 'free' && a.second.id === id ? a.second : null;
}
function open(s: Slot, e: ArbiterEvent) {
  s.id = e.id; s.kind = e.kind; s.epoch = e.epoch; s.x0 = s.x = e.x; s.y0 = s.y = e.y; s.t0 = s.t = e.t;
  s.travel = 0; s.drone = -1; s.guide = false; s.role = 'pending';
}
function zoneReject(z: StartZone, x: number, y: number): number {
  if (!(z.width > 0 && z.height > 0)) return -1;
  const lx = x - z.x, ly = y - z.y;
  if (lx < z.left || lx > z.width - z.right) return REJECT_EDGE;
  if (ly < z.top) return REJECT_HEADER;
  return ly > z.height - z.bottom ? REJECT_BOTTOM : -1;
}
function unguide(a: Arbiter, s: Slot) { if (s.guide) { s.guide = false; emit(a, 'guide', s.id, s.x, s.y, s.t, -1, 0); } }
/** Drops a pointer with no command: a live stroke cancels, sustained fire ends, an armed ring disarms. Dead until it lifts. */
function kill(a: Arbiter, s: Slot) {
  if (s.role === 'stroke') emit(a, 'cancel', s.id, s.x, s.y, s.t);
  else if (s.role === 'sustain') emit(a, 'sustainEnd', s.id, s.x, s.y, s.t, s.drone);
  else if (s.role === 'armed') emit(a, 'disarm', s.id, s.x, s.y, s.t, s.drone);
  unguide(a, s); s.role = 'spent';
}
function inkEnd(a: Arbiter, type: 'commit' | 'cancel', t: number): boolean {
  const k = a.ink;
  if (k.mode !== 'inking') return false;
  if (k.guide) { k.guide = false; emit(a, 'guide', k.id, k.x, k.y, t, -1, 0); }
  emit(a, type, k.id, k.x, k.y, t); k.mode = 'idle'; return true;
}
function inkStart(a: Arbiter, s: Slot) {
  const k = a.ink; k.mode = 'inking'; k.id = s.id; k.epoch = s.epoch; k.arc = 0; k.guide = false;
  k.x = k.restX = s.x; k.y = k.restY = s.y; k.restT = s.t; emit(a, 'begin', s.id, s.x, s.y, s.t);
}
/** The pointer left the slop: desktop Conduct looks; everything else becomes a stroke from its down point. */
function toStroke(a: Arbiter, s: Slot) {
  unguide(a, s);
  if (desk(s) && a.cfg.scheme === 'conduct') {
    s.role = 'look'; emit(a, 'look', s.id, s.x0, s.y0, s.t0, -1, 0); emit(a, 'look', s.id, s.x, s.y, s.t, -1, 1); return;
  }
  inkEnd(a, 'cancel', s.t);
  s.role = 'stroke'; emit(a, 'begin', s.id, s.x0, s.y0, s.t0); emit(a, 'extend', s.id, s.x, s.y, s.t);
}
/** Timers, judged on the pointer's travel so far: sustain at 180 ms, the guide at 250 ms, the brake ring to 900 ms. */
function advance(a: Arbiter, s: Slot, t: number) {
  const age = t - s.t0;
  if (s.role === 'armed' && age >= SUSTAIN_MS) { s.role = 'sustain'; emit(a, 'sustain', s.id, s.x, s.y, t, s.drone); return; }
  if (s.role === 'pending' && !desk(s) && a.cfg.scheme !== 'conduct' && age >= HOLD_MS) {
    s.role = 'hold'; s.guide = true; emit(a, 'guide', s.id, s.x0, s.y0, t, -1, 1);
  }
  if (s.role !== 'hold') return;
  if (age >= BRAKE_HOLD_MS) { unguide(a, s); emit(a, 'brake', s.id, s.x, s.y, t); s.role = 'spent'; return; }
  emit(a, 'brakeRing', s.id, s.x0, s.y0, t, -1, Math.max(0, (age - HOLD_MS) / (BRAKE_HOLD_MS - HOLD_MS)));
}
function moveSlot(a: Arbiter, s: Slot, x: number, y: number, t: number) {
  s.x = x; s.y = y; s.t = t;
  const d = Math.hypot(x - s.x0, y - s.y0); if (d > s.travel) s.travel = d;
  const broke = s.travel > slop(s.kind);
  if (s.role === 'stroke') emit(a, 'extend', s.id, x, y, t);
  else if (s.role === 'look') emit(a, 'look', s.id, x, y, t, -1, 1);
  else if (s.role === 'armed' && broke) { emit(a, 'disarm', s.id, x, y, t, s.drone); toStroke(a, s); }
  else if ((s.role === 'pending' || s.role === 'hold') && broke) toStroke(a, s);
  else if (s.role === 'tap2' && broke) s.role = 'spent';
}
function emptyTap(a: Arbiter, s: Slot) {
  if (desk(s)) { if (a.cfg.scheme === 'conduct') emit(a, 'clickToggle', s.id, s.x, s.y, s.t); else inkStart(a, s); return; }
  if (a.cfg.blaster()) emit(a, 'miss', s.id, s.x, s.y, s.t);
  else if (a.cfg.scheme === 'draw') emit(a, 'flyTo', s.id, s.x, s.y, s.t);
}
function upSlot(a: Arbiter, s: Slot) {
  const tap = isTap(s);
  if (s.role === 'armed') emit(a, tap ? 'burst' : 'disarm', s.id, s.x, s.y, s.t, s.drone);
  else if (s.role === 'sustain') emit(a, 'sustainEnd', s.id, s.x, s.y, s.t, s.drone);
  else if (s.role === 'stroke') {
    emit(a, 'commit', s.id, s.x, s.y, s.t);
    if (tap && !desk(s) && a.cfg.scheme === 'conduct' && a.cfg.blaster()) emit(a, 'miss', s.id, s.x, s.y, s.t);
  } else if (s.role === 'hold') unguide(a, s);
  else if (s.role === 'pending' && tap) emptyTap(a, s);
  else if (s.role === 'tap2' && tap) {
    // Second-finger brake. Draw clears the path and Brush cancels the program: the owner's stroke or hold is dropped.
    if (a.cfg.scheme !== 'conduct' && (a.owner.role === 'stroke' || a.owner.role === 'pending' || a.owner.role === 'hold')) kill(a, a.owner);
    emit(a, 'brake', s.id, s.x, s.y, s.t);
  }
  if (s === a.owner && a.ink.mode === 'committing') a.ink.mode = 'idle';
  s.role = 'free';
}
function touchDown(a: Arbiter, e: ArbiterEvent) {
  const s = a.owner.role === 'free' ? a.owner : a.second.role === 'free' ? a.second : null;
  if (!s || find(a, e.id)) return;
  const r = zoneReject(a.cfg.zone, e.x, e.y);
  if (r >= 0) { a.rejects++; emit(a, 'reject', e.id, e.x, e.y, e.t, r); return; }
  open(s, e);
  const d = a.cfg.pick(e.x, e.y, e.t);
  if (s === a.second) { if (d >= 0) { emit(a, 'blastNow', e.id, e.x, e.y, e.t, d); s.role = 'spent'; } else s.role = 'tap2'; return; }
  if (d >= 0) { s.role = 'armed'; s.drone = d; emit(a, 'armBlast', e.id, e.x, e.y, e.t, d); }
  else if (a.cfg.scheme === 'conduct') { s.role = 'stroke'; emit(a, 'begin', e.id, e.x, e.y, e.t); }
}
function deskDown(a: Arbiter, e: ArbiterEvent) {
  const s = a.owner; if (s.role !== 'free') return;
  open(s, e);
  // While inking, clicks belong to the ink: this press commits (even on a drone) and is swallowed until it lifts.
  if (inkEnd(a, 'commit', e.t)) { a.ink.mode = 'committing'; s.role = 'spent'; return; }
  const d = a.cfg.pick(e.x, e.y, e.t);
  if (d >= 0) { s.role = 'armed'; s.drone = d; emit(a, 'armBlast', e.id, e.x, e.y, e.t, d); }
}
function hover(a: Arbiter, e: ArbiterEvent) {
  const k = a.ink; if (k.mode !== 'inking' || e.id !== k.id) return;
  inkTick(a, e.t); if (k.mode !== 'inking') return;
  k.arc += Math.hypot(e.x - k.x, e.y - k.y); k.x = e.x; k.y = e.y;
  if (Math.hypot(e.x - k.restX, e.y - k.restY) > TAP_SLOP_MOUSE) {
    k.restX = e.x; k.restY = e.y; k.restT = e.t;
    if (k.guide) { k.guide = false; emit(a, 'guide', k.id, e.x, e.y, e.t, -1, 0); }
  }
  emit(a, 'extend', k.id, e.x, e.y, e.t);
}
/** Hover ink commits after a 350 ms rest once it has 60 px; Brush shows the guide after a 250 ms rest with less ink. */
function inkTick(a: Arbiter, t: number) {
  const k = a.ink; if (k.mode !== 'inking') return;
  const rest = t - k.restT;
  if (k.arc >= REST_COMMIT_MIN_PX && rest >= REST_COMMIT_MS) inkEnd(a, 'commit', t);
  else if (a.cfg.scheme === 'brush' && k.arc < REST_COMMIT_MIN_PX && rest >= HOLD_MS && !k.guide) {
    k.guide = true; emit(a, 'guide', k.id, k.x, k.y, t, -1, 1);
  }
}
function checkEpoch(a: Arbiter, epoch: number, t: number) {
  if (live(a.owner) && a.owner.epoch !== epoch) kill(a, a.owner);
  if (live(a.second) && a.second.epoch !== epoch) kill(a, a.second);
  if (a.ink.mode === 'inking' && a.ink.epoch !== epoch) inkEnd(a, 'cancel', t);
}
/** Feeds one event; the outputs are a.out[0 .. returned count). */
export function arbiterDispatch(a: Arbiter, e: ArbiterEvent): number {
  a.n = 0;
  checkEpoch(a, e.epoch, e.t);
  const s = e.type === 'move' || e.type === 'up' || e.type === 'cancel' ? find(a, e.id) : null;
  if (e.type === 'down') { if (e.kind === 'mouse') deskDown(a, e); else touchDown(a, e); }
  else if (e.type === 'move') { if (s) { advance(a, s, e.t); moveSlot(a, s, e.x, e.y, e.t); } else if (e.kind === 'mouse') hover(a, e); }
  else if (e.type === 'up' && s) { advance(a, s, e.t); moveSlot(a, s, e.x, e.y, e.t); upSlot(a, s); }
  else if (e.type === 'cancel' && s) { kill(a, s); s.role = 'free'; if (a.ink.mode === 'committing') a.ink.mode = 'idle'; }
  else if (e.type === 'tick') { if (live(a.owner)) advance(a, a.owner, e.t); inkTick(a, e.t); }
  else if (e.type === 'escape') {
    // Escape or right-click: cancel the live stroke or ink; with nothing to cancel it brakes (Conduct: stops cruise).
    if (a.owner.role === 'stroke') kill(a, a.owner);
    else if (!inkEnd(a, 'cancel', e.t)) emit(a, 'brake', e.id, e.x, e.y, e.t);
  }
  return a.n;
}
/** Commits the live stroke or hover ink now (Brush's mid-stroke swipe probe). The pointer stays dead until it lifts. */
export function arbiterCommit(a: Arbiter, t: number): number {
  a.n = 0;
  if (a.owner.role === 'stroke') { emit(a, 'commit', a.owner.id, a.owner.x, a.owner.y, t); a.owner.role = 'spent'; }
  else inkEnd(a, 'commit', t);
  return a.n;
}
/** Blur, pause or unmount: every pointer and the ink drop with no command, and all slots are freed. */
export function arbiterReset(a: Arbiter, t: number): number {
  a.n = 0;
  kill(a, a.owner); kill(a, a.second); inkEnd(a, 'cancel', t);
  a.owner.role = a.second.role = 'free'; a.ink.mode = 'idle';
  return a.n;
}
/** True while a timer can fire without pointer events (the adapter runs its tick loop only then). */
export function arbiterNeedsTick(a: Arbiter): boolean {
  const r = a.owner.role;
  return r === 'armed' || r === 'hold' || (r === 'pending' && a.owner.kind !== 'mouse') || a.ink.mode === 'inking';
}
/** A stroke or hover ink is live (keyboard Escape cancels it instead of pausing). */
export function arbiterLive(a: Arbiter): boolean { return a.owner.role === 'stroke' || a.ink.mode === 'inking'; }
export function arbiterTracks(a: Arbiter, id: number): boolean { return find(a, id) !== null; }

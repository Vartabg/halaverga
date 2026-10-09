// Player tracers and muzzle sprites: 2 draw calls, pooled, additive and untonemapped, on the pausing shooter clock.
// Muzzle flash, two tiers: a small flash on every shot, sized in screen pixels so it stays under 90 x 90 px at any camera distance
// (below the WCAG 2.3.1 small-area limit), and a larger world-size bloom that keeps the 3-per-second flash gate. Flash, glow and
// bloom sit at the kicked cannon muzzle (cannonLink.fxMuzzle, published at -19), and a shot fired this frame starts its tracer
// there too, so flash, tail and cannon kick share the shot frame. Every muzzle sprite keeps its edge 40 CSS px off screen centre.
import { useEffect, useMemo } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import { HEAT, flashGate, mulberry32, readEvents, type ShotEvent, type Vec3 } from '@/game/combat';
import { eventBurstIndex } from '@/game/burst';
import { guarded } from '@/game/shooterFault';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { cannonLink } from './cannonContract';
import { CLEAR_PX, claim, haloAlpha, haloClampPx, isShotKind, makePuffs, makeSteam, metresPerPx, pxSize, startSteam, stepSteam, tracerOrigin,
  tracerSpan, tracerWidth, type Ring, type TracerOrigin, type TracerSpan } from './fxPools';
import { FX, commit, disposePool, drawPuffs, hideSprite, retainFx, setSprite, spritePool, tracerPool } from './fxMaterials';
const TRACERS = 8, STEAM = 6, TR = 8, GLOW = 0, CORE = 1, HALO = 2, BLOOM = 3, GLINT = 4, PUFFS = 5, SPRITES = PUFFS + STEAM;
/** Per-shot flash: 50 ms, core <= 36 px and .45 m, halo <= 80 px and .9 m. Gated bloom: .9 m for 33 ms. Miss glint: 80 ms, >= 6 px. */
const FLASH_T = .05, BLOOM_T = .033, GLINT_T = .08, CORE_PX = 36, HALO_PX = 80, GLOW_PX = 40, GLINT_PX = 6;
const copy = (o: Vec3, v: Vec3) => { o.x = v.x; o.y = v.y; o.z = v.z; return o; };
const ndc = new Vector3();
/** The kicked cannon muzzle, else the solved gameplay muzzle, else the fallback (the shot's own origin). */
const muzzleOr = (fallback: Vec3): Vec3 => cannonLink.fxMuzzle.valid ? cannonLink.fxMuzzle : runtime.shooter.muzzle.valid ? runtime.shooter.muzzle : fallback;

function createShotFx() {
  const tracers = tracerPool(TRACERS), sprites = spritePool(SPRITES, true);
  const a = tracers.geometry.attributes, start = a.aStart.array as Float32Array, end = a.aEnd.array as Float32Array;
  const width = a.aWidth.array as Float32Array, alpha = a.aAlpha.array as Float32Array;
  // Per tracer: born, from xyz, unit dir xyz, dist. live: 0 dead, 1 drawn, 2 spawned but not drawn with length yet.
  const tr = new Float64Array(TRACERS * TR), live = new Uint8Array(TRACERS), ring: Ring = { next: 0, size: TRACERS };
  const steam = makePuffs(STEAM), steamQ = makeSteam(), steamFrom = { x: 0, y: 0, z: 0 }, hist = new Float64Array(3).fill(-Infinity), rng = mulberry32(0x5eed01);
  const cursor = { last: runtime.shooter.eventSerial }, span: TracerSpan = { head: 0, tail: 0, alive: false, fade: 1 };
  const lastFrom = { x: 0, y: 0, z: 0 }, flashPos = { x: 0, y: 0, z: 0 }, glowCol = { r: 0, g: 0, b: 0 };
  const glintPos = { x: 0, y: 0, z: 0 }, shown = new Uint8Array(PUFFS), org: TracerOrigin = { from: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 }, dist: 0 };
  let reduced = false, flashAt = -1e9, bloomAt = -1e9, glintAt = -1e9, spriteTop = 0, clock = 0, haloA = .45;
  /** Marks a fixed sprite slot drawn (raising the draw count) or hides it once when it goes dark. */
  const show = (slot: number, on: boolean) => {
    if (on) { shown[slot] = 1; spriteTop = Math.max(spriteTop, slot + 1); } else if (shown[slot]) { hideSprite(sprites, slot); shown[slot] = 0; }
    return on;
  };
  /** CSS px from screen centre that the muzzle sprites may use: they stay 40 px off centre and never cross the vertical centre line. */
  const clearOf = (p: Vec3, cam: PerspectiveCamera, w: number, h: number) => {
    ndc.set(p.x, p.y, p.z).project(cam);
    if (!(ndc.z > -1 && ndc.z < 1)) return Infinity;
    const x = ndc.x * w / 2, y = ndc.y * h / 2;
    return Math.min(Math.hypot(x, y), Math.abs(x) + CLEAR_PX);
  };
  const onEvent = (e: ShotEvent) => {
    // Steam leaves the cannon's vent mouth from 40 ms on, spawned lazily in frame() as the hatch opens.
    if (e.kind === 'overheat') { copy(steamFrom, e.from); startSteam(steamQ, e.t); return; }
    if (!isShotKind(e.kind)) return;
    copy(lastFrom, e.from);
    if (reduced) return;
    flashAt = e.t; copy(flashPos, muzzleOr(e.from)); haloA = haloAlpha(eventBurstIndex(e.serial));
    if (flashGate(hist, 0, e.t)) bloomAt = e.t;
    if (e.kind === 'miss') { glintAt = e.t; copy(glintPos, e.point); }
    if (!tracerOrigin(e, clock, cannonLink.fxMuzzle, org)) return;
    const i = claim(ring), o = i * TR, f = org.from, d = org.dir;
    tr[o] = e.t; tr[o + 1] = f.x; tr[o + 2] = f.y; tr[o + 3] = f.z;
    tr[o + 4] = d.x; tr[o + 5] = d.y; tr[o + 6] = d.z; tr[o + 7] = org.dist; live[i] = 2;
  };
  const hideTracer = (i: number) => { width[i] = 0; alpha[i] = 0; live[i] = 0; };
  const frame = (st: RootState) => {
    const s = runtime.shooter, t = s.clock, el = st.gl.domElement;
    reduced = useGame.getState().reduced; clock = t;
    readEvents(s, cursor, onEvent);
    const cam = st.camera as PerspectiveCamera, fov = cam.fov || s.aim.fov, h = el.clientHeight || 1, w = el.clientWidth || 1, c = cam.position;
    const floorPx = s.input.lookSource === 'touch' || s.input.lookSource === 'tap' ? 2 : 1.5;
    let top = 0;
    for (let i = 0; i < TRACERS; i++) {
      if (!live[i]) continue;
      const o = i * TR, dist = tr[o + 7];
      tracerSpan(t - tr[o], dist, span, live[i] === 2);
      if (!span.alive) {
        // A short shot can finish between two frames: draw its final streak once so every tracer is seen.
        if (live[i] !== 2) { hideTracer(i); continue; }
        span.head = dist; span.tail = 0; span.fade = 1;
      } else if (span.head - span.tail < 1e-4) { width[i] = 0; top = i + 1; continue; }
      live[i] = 1;
      const k = i * 3, fx = tr[o + 1], fy = tr[o + 2], fz = tr[o + 3], ux = tr[o + 4], uy = tr[o + 5], uz = tr[o + 6];
      start[k] = fx + ux * span.tail; start[k + 1] = fy + uy * span.tail; start[k + 2] = fz + uz * span.tail;
      end[k] = fx + ux * span.head; end[k + 1] = fy + uy * span.head; end[k + 2] = fz + uz * span.head;
      const m = (span.head + span.tail) / 2;
      width[i] = tracerWidth(Math.hypot(fx + ux * m - c.x, fy + uy * m - c.y, fz + uz * m - c.z), fov, h, floorPx); alpha[i] = span.fade ?? 1;
      top = i + 1;
    }
    commit(tracers, top);
    spriteTop = 0;
    // Metres per screen pixel at the muzzle: the per-shot flash and the glow are sized in pixels, then capped in metres.
    const mz = muzzleOr(lastFrom), px = metresPerPx(Math.hypot(mz.x - c.x, mz.y - c.y, mz.z - c.z), fov, h);
    // A steady emitter glow is not a flash (WCAG 2.3.1): it warms from the fringe cyan to hot orange with heat.
    if (show(GLOW, s.weapon.sinceShot < .3)) {
      const heat = Math.min(1, Math.max(0, s.weapon.heat / HEAT.max)), g = pxSize(haloClampPx(clearOf(mz, cam, w, h), GLOW_PX, CORE_PX), .3, px);
      glowCol.r = FX.fringe.r + (FX.hot.r - FX.fringe.r) * heat; glowCol.g = FX.fringe.g + (FX.hot.g - FX.fringe.g) * heat;
      glowCol.b = FX.fringe.b + (FX.hot.b - FX.fringe.b) * heat;
      setSprite(sprites, GLOW, mz, g, g, glowCol, 1, .6 + .3 * heat);
    }
    const fa = t - flashAt, f = muzzleOr(flashPos), flash = fa >= 0 && fa < FLASH_T, bloom = t - bloomAt >= 0 && t - bloomAt < BLOOM_T;
    const room = flash || bloom ? clearOf(f, cam, w, h) : Infinity, halo = haloClampPx(room, HALO_PX, CORE_PX);
    if (show(CORE, flash)) { const k = pxSize(Math.min(CORE_PX, halo), .45, px); setSprite(sprites, CORE, f, k, k, FX.core, 2, 1); }
    if (show(HALO, flash)) { const k = pxSize(halo, .9, px); setSprite(sprites, HALO, f, k, k, FX.fringe, 1, haloA); }
    if (show(BLOOM, bloom)) { const k = pxSize(haloClampPx(room, .9 / Math.max(px, 1e-9), CORE_PX), .9, px); setSprite(sprites, BLOOM, f, k, k, FX.fringe, 1, .35); }
    const ga = t - glintAt;
    if (show(GLINT, !reduced && ga >= 0 && ga < GLINT_T)) {
      const k = Math.max(.3, GLINT_PX * metresPerPx(Math.hypot(glintPos.x - c.x, glintPos.y - c.y, glintPos.z - c.z), fov, h));
      setSprite(sprites, GLINT, glintPos, k, k, FX.core, 1, 1 - ga / GLINT_T);
    }
    stepSteam(steamQ, t, cannonLink.ventMouth, muzzleOr(steamFrom), rng, steam, FX.steam, cannonLink.ventDir);
    commit(sprites, Math.max(spriteTop, drawPuffs(sprites, steam, t, PUFFS)));
  };
  return { tracers, sprites, tick: guarded('ShotFx', frame) };
}

export default function ShotFx() {
  const fx = useMemo(createShotFx, []);
  useEffect(() => {
    const release = retainFx();
    return () => { disposePool(fx.tracers); disposePool(fx.sprites); release(); };
  }, [fx]);
  useFrame(fx.tick, -5);
  return <><primitive object={fx.tracers} /><primitive object={fx.sprites} /></>;
}

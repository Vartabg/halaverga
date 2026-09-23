// Player tracers and muzzle sprites: 2 draw calls, pooled, additive and untonemapped, on the pausing shooter clock.
// Muzzle flash, two tiers: a small flash on every shot, sized in screen pixels so it stays under 90 x 90 px at any camera distance
// (below the WCAG 2.3.1 small-area limit), and a larger world-size bloom that keeps the 3-per-second flash gate.
import { useEffect, useMemo } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { HEAT, flashGate, mulberry32, readEvents, type ShotEvent, type Vec3 } from '@/game/combat';
import { guarded } from '@/game/shooterFault';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { claim, isShotKind, makePuffs, metresPerPx, pxSize, spawnPuff, tracerSpan, tracerWidth, type Ring, type TracerSpan } from './fxPools';
import { FX, commit, disposePool, drawPuffs, hideSprite, retainFx, setSprite, spritePool, tracerPool } from './fxMaterials';
const TRACERS = 8, STEAM = 6, TR = 8, GLOW = 0, CORE = 1, HALO = 2, BLOOM = 3, GLINT = 4, PUFFS = 5, SPRITES = PUFFS + STEAM;
/** Per-shot flash: 50 ms, core <= 36 px and .45 m, halo <= 80 px and .9 m. Gated bloom: .9 m for 33 ms. Miss glint: 80 ms, >= 6 px. */
const FLASH_T = .05, BLOOM_T = .033, GLINT_T = .08, CORE_PX = 36, HALO_PX = 80, GLOW_PX = 40, GLINT_PX = 6;
const copy = (o: Vec3, v: Vec3) => { o.x = v.x; o.y = v.y; o.z = v.z; return o; };

function createShotFx() {
  const tracers = tracerPool(TRACERS), sprites = spritePool(SPRITES, true);
  const a = tracers.geometry.attributes, start = a.aStart.array as Float32Array, end = a.aEnd.array as Float32Array;
  const width = a.aWidth.array as Float32Array, alpha = a.aAlpha.array as Float32Array;
  // Per tracer: born, from xyz, unit dir xyz, dist. live: 0 dead, 1 drawn, 2 spawned but not drawn with length yet.
  const tr = new Float64Array(TRACERS * TR), live = new Uint8Array(TRACERS), ring: Ring = { next: 0, size: TRACERS };
  const steam = makePuffs(STEAM), hist = new Float64Array(3).fill(-Infinity), rng = mulberry32(0x5eed01);
  const cursor = { last: runtime.shooter.eventSerial }, span: TracerSpan = { head: 0, tail: 0, alive: false, fade: 1 };
  const lastFrom = { x: 0, y: 0, z: 0 }, flashPos = { x: 0, y: 0, z: 0 }, puff = { x: 0, y: 0, z: 0 }, glowCol = { r: 0, g: 0, b: 0 };
  const glintPos = { x: 0, y: 0, z: 0 }, shown = new Uint8Array(PUFFS);
  let reduced = false, flashAt = -1e9, bloomAt = -1e9, glintAt = -1e9, spriteTop = 0;
  /** Marks a fixed sprite slot drawn (raising the draw count) or hides it once when it goes dark. */
  const show = (slot: number, on: boolean) => {
    if (on) { shown[slot] = 1; spriteTop = Math.max(spriteTop, slot + 1); } else if (shown[slot]) { hideSprite(sprites, slot); shown[slot] = 0; }
    return on;
  };
  const muzzleOr = (fallback: Vec3) => runtime.shooter.muzzle.valid ? runtime.shooter.muzzle : fallback;
  const onEvent = (e: ShotEvent) => {
    if (e.kind === 'overheat') {
      const m = muzzleOr(e.from);
      for (let k = 0; k < STEAM; k++) {
        puff.x = m.x + (rng() - .5) * .12; puff.y = m.y + rng() * .08; puff.z = m.z + (rng() - .5) * .12;
        spawnPuff(steam, e.t + k * .04, puff, .8, 1.1, .2, .8, 1, FX.steam, FX.steam, .45);
      }
      return;
    }
    if (!isShotKind(e.kind)) return;
    copy(lastFrom, e.from);
    if (reduced) return;
    flashAt = e.t; copy(flashPos, muzzleOr(e.from));
    if (flashGate(hist, 0, e.t)) bloomAt = e.t;
    if (e.kind === 'miss') { glintAt = e.t; copy(glintPos, e.point); }
    const dx = e.point.x - e.from.x, dy = e.point.y - e.from.y, dz = e.point.z - e.from.z, d = Math.hypot(dx, dy, dz);
    if (d < 1e-3) return;
    const i = claim(ring), o = i * TR;
    tr[o] = e.t; tr[o + 1] = e.from.x; tr[o + 2] = e.from.y; tr[o + 3] = e.from.z;
    tr[o + 4] = dx / d; tr[o + 5] = dy / d; tr[o + 6] = dz / d; tr[o + 7] = d; live[i] = 2;
  };
  const hideTracer = (i: number) => { width[i] = 0; alpha[i] = 0; live[i] = 0; };
  const frame = (st: RootState) => {
    const s = runtime.shooter, t = s.clock;
    reduced = useGame.getState().reduced;
    readEvents(s, cursor, onEvent);
    const cam = st.camera as PerspectiveCamera, fov = cam.fov || s.aim.fov, h = st.gl.domElement.clientHeight || 1, c = cam.position;
    let top = 0;
    for (let i = 0; i < TRACERS; i++) {
      if (!live[i]) continue;
      const o = i * TR, dist = tr[o + 7];
      tracerSpan(t - tr[o], dist, span);
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
      width[i] = tracerWidth(Math.hypot(fx + ux * m - c.x, fy + uy * m - c.y, fz + uz * m - c.z), fov, h); alpha[i] = span.fade ?? 1;
      top = i + 1;
    }
    commit(tracers, top);
    spriteTop = 0;
    // Metres per screen pixel at the muzzle: the per-shot flash and the glow are sized in pixels, then capped in metres.
    const mz = muzzleOr(lastFrom), px = metresPerPx(Math.hypot(mz.x - c.x, mz.y - c.y, mz.z - c.z), fov, h);
    // A steady emitter glow is not a flash (WCAG 2.3.1): it warms from the fringe cyan to hot orange with heat.
    if (show(GLOW, s.weapon.sinceShot < .3)) {
      const heat = Math.min(1, Math.max(0, s.weapon.heat / HEAT.max)), g = pxSize(GLOW_PX, .3, px);
      glowCol.r = FX.fringe.r + (FX.hot.r - FX.fringe.r) * heat; glowCol.g = FX.fringe.g + (FX.hot.g - FX.fringe.g) * heat;
      glowCol.b = FX.fringe.b + (FX.hot.b - FX.fringe.b) * heat;
      setSprite(sprites, GLOW, mz, g, g, glowCol, 1, .6 + .3 * heat);
    }
    const fa = t - flashAt, f = muzzleOr(flashPos);
    if (show(CORE, fa >= 0 && fa < FLASH_T)) { const k = pxSize(CORE_PX, .45, px); setSprite(sprites, CORE, f, k, k, FX.core, 2, 1); }
    if (show(HALO, fa >= 0 && fa < FLASH_T)) { const k = pxSize(HALO_PX, .9, px); setSprite(sprites, HALO, f, k, k, FX.fringe, 1, .45); }
    if (show(BLOOM, t - bloomAt >= 0 && t - bloomAt < BLOOM_T)) setSprite(sprites, BLOOM, f, .9, .9, FX.fringe, 1, .35);
    const ga = t - glintAt;
    if (show(GLINT, !reduced && ga >= 0 && ga < GLINT_T)) {
      const k = Math.max(.3, GLINT_PX * metresPerPx(Math.hypot(glintPos.x - c.x, glintPos.y - c.y, glintPos.z - c.z), fov, h));
      setSprite(sprites, GLINT, glintPos, k, k, FX.core, 1, 1 - ga / GLINT_T);
    }
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

// Player tracers and muzzle sprites: 2 draw calls, pooled, additive and untonemapped, on the pausing shooter clock.
import { useEffect, useMemo } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { HEAT, flashGate, mulberry32, readEvents, type ShotEvent, type Vec3 } from '@/game/combat';
import { guarded } from '@/game/shooterFault';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { claim, isShotKind, makePuffs, spawnPuff, tracerSpan, tracerWidth, type Ring } from './fxPools';
import { FX, commit, disposePool, drawPuffs, hideSprite, retainFx, setSprite, spritePool, tracerPool } from './fxMaterials';
const TRACERS = 8, SPRITES = 8, STEAM = 6, TR = 8, GLOW = 0, FLASH = 1;
const copy = (o: Vec3, v: Vec3) => { o.x = v.x; o.y = v.y; o.z = v.z; return o; };

function createShotFx() {
  const tracers = tracerPool(TRACERS), sprites = spritePool(SPRITES, true);
  const a = tracers.geometry.attributes, start = a.aStart.array as Float32Array, end = a.aEnd.array as Float32Array;
  const width = a.aWidth.array as Float32Array, alpha = a.aAlpha.array as Float32Array;
  // Per tracer: born, from xyz, unit dir xyz, dist. live: 0 dead, 1 drawn, 2 spawned but not drawn with length yet.
  const tr = new Float64Array(TRACERS * TR), live = new Uint8Array(TRACERS), ring: Ring = { next: 0, size: TRACERS };
  const steam = makePuffs(STEAM), hist = new Float64Array(3).fill(-Infinity), rng = mulberry32(0x5eed01);
  const cursor = { last: runtime.shooter.eventSerial }, span = { head: 0, tail: 0, alive: false };
  const lastFrom = { x: 0, y: 0, z: 0 }, flashPos = { x: 0, y: 0, z: 0 }, puff = { x: 0, y: 0, z: 0 }, glowCol = { r: 0, g: 0, b: 0 };
  let reduced = false, flashAt = -1e9, glowShown = false, flashShown = false;
  const muzzleOr = (fallback: Vec3) => runtime.shooter.muzzle.valid ? runtime.shooter.muzzle : fallback;
  const onEvent = (e: ShotEvent) => {
    if (e.kind === 'overheat') {
      const m = muzzleOr(e.from);
      for (let k = 0; k < STEAM; k++) {
        puff.x = m.x + (rng() - .5) * .12; puff.y = m.y + rng() * .08; puff.z = m.z + (rng() - .5) * .12;
        spawnPuff(steam, e.t + k * .04, puff, .8, .9, .12, .42, 1, FX.steam, FX.steam, .25);
      }
      return;
    }
    if (!isShotKind(e.kind)) return;
    copy(lastFrom, e.from);
    if (reduced) return;
    if (flashGate(hist, 0, e.t)) { flashAt = e.t; copy(flashPos, muzzleOr(e.from)); }
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
        span.head = dist; span.tail = Math.max(0, dist - Math.min(dist, 18));
      } else if (span.head - span.tail < 1e-4) { width[i] = 0; top = i + 1; continue; }
      live[i] = 1;
      const k = i * 3, fx = tr[o + 1], fy = tr[o + 2], fz = tr[o + 3], ux = tr[o + 4], uy = tr[o + 5], uz = tr[o + 6];
      start[k] = fx + ux * span.tail; start[k + 1] = fy + uy * span.tail; start[k + 2] = fz + uz * span.tail;
      end[k] = fx + ux * span.head; end[k + 1] = fy + uy * span.head; end[k + 2] = fz + uz * span.head;
      const m = (span.head + span.tail) / 2;
      width[i] = tracerWidth(Math.hypot(fx + ux * m - c.x, fy + uy * m - c.y, fz + uz * m - c.z), fov, h); alpha[i] = 1;
      top = i + 1;
    }
    commit(tracers, top);
    top = 0;
    // A steady emitter glow is not a flash (WCAG 2.3.1): it warms from the fringe cyan to hot orange with heat.
    if (s.weapon.sinceShot < .3) {
      const heat = Math.min(1, Math.max(0, s.weapon.heat / HEAT.max));
      glowCol.r = FX.fringe.r + (FX.hot.r - FX.fringe.r) * heat; glowCol.g = FX.fringe.g + (FX.hot.g - FX.fringe.g) * heat;
      glowCol.b = FX.fringe.b + (FX.hot.b - FX.fringe.b) * heat;
      setSprite(sprites, GLOW, muzzleOr(lastFrom), .14, .14, glowCol, 1, .35 + .5 * heat); glowShown = true; top = GLOW + 1;
    } else if (glowShown) { hideSprite(sprites, GLOW); glowShown = false; }
    if (t - flashAt >= 0 && t - flashAt < .033) {
      setSprite(sprites, FLASH, muzzleOr(flashPos), .2, .2, FX.core, 1.5, 1); flashShown = true; top = FLASH + 1;
    } else if (flashShown) { hideSprite(sprites, FLASH); flashShown = false; }
    commit(sprites, Math.max(top, drawPuffs(sprites, steam, t, 2)));
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

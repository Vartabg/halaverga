import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import type RAPIER from '@dimforge/rapier3d-compat';
import { ONLY_FIXED, SHOT_GROUPS } from '@/game/combat';
import { createShooterWorld, type WorldHit } from '@/game/shotResolve';
import { drawPath, type DrawHit, type DrawPath, type SweepCast } from '@/game/gesture/drawPath';
import { SWEEP_MAX_FRAME, SWEEP_RADIUS } from '@/game/gesture/tuning';
import type { Vec } from '@/game/motion';
// Draw the flight's world probe (spec 4.3-4.4), useFrame -45: after the physics step (Player -50) has flown the path, before the
// presentation. It casts a pending end ray (castShot, fixed colliders only) and hands the hit to drawPath.finish, then sweeps
// newly final segments with the FlightSafety ball (r 1.05), at most SWEEP_MAX_FRAME casts per frame. Lazy-mounted with the lab.

const identity = { x: 0, y: 0, z: 0, w: 1 };
/** Longest end ray, m: past the deepest ink (DRAW_D_MAX) with room for a rooftop behind it. */
export const END_RANGE = 160;

/** A SweepCast over Rapier: the fraction of a -> b the ball travels before a fixed, non-boundary collider (1 when clear). */
export function ballSweep(world: RAPIER.World, ball: RAPIER.Shape): SweepCast {
  const delta: Vec = { x: 0, y: 0, z: 0 };
  return (a, b) => {
    delta.x = b.x - a.x; delta.y = b.y - a.y; delta.z = b.z - a.z;
    const hit = world.castShape(a, identity, delta, ball, 0, 1, false, ONLY_FIXED, SHOT_GROUPS);
    return hit ? hit.time_of_impact : 1;
  };
}

/** One probe frame: the pending end ray first (so a landing retarget is swept with the rest), then the sweep. */
export function probeDrawPath(path: DrawPath, castShot: (o: Vec, d: Vec, maxT: number, out: WorldHit) => boolean,
  sweep: SweepCast, hit: WorldHit, end: DrawHit, now = 0) {
  if (path.pendingEnd) {
    const o = path.endO, d = path.endD, ok = castShot(o, d, END_RANGE, hit);
    if (ok) {
      end.point.x = o.x + d.x * hit.t; end.point.y = o.y + d.y * hit.t; end.point.z = o.z + d.z * hit.t;
      end.normal.x = hit.normal.x; end.normal.y = hit.normal.y; end.normal.z = hit.normal.z;
    }
    path.finish(ok ? end : null);
  }
  path.sweep(sweep, SWEEP_MAX_FRAME, now);
}

export default function DrawProbe() {
  const { world, rapier } = useRapier();
  const frame = useMemo(() => {
    const shots = createShooterWorld(world, rapier), sweep = ballSweep(world, new rapier.Ball(SWEEP_RADIUS));
    const hit: WorldHit = { t: 0, normal: { x: 0, y: 1, z: 0 } };
    const end: DrawHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
    let failed = false;   // a probe fault stops probing (the path is then unswept, and anticipate still brakes) but never the frame loop
    return () => {
      if (failed) return;
      try { probeDrawPath(drawPath, shots.castShot, sweep, hit, end, performance.now()); } catch (e) { failed = true; console.error('[lab] DrawProbe', e); }
    };
  }, [world, rapier]);
  useFrame(frame, -45);
  return null;
}

import type RAPIER from '@dimforge/rapier3d-compat';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Vec } from '../game/motion';
import { BOUNDARY_GROUPS } from '../game/combat';
import { poseArchangelWing, type ArchangelWings } from './archangelWings';
import { createWingEnvelope } from './wingEnvelope';

export const WING_CLEARANCE = { margin: .16, lookAhead: .30, hold: .24, closeRate: 18, openRate: 3.5 };
/** Visible fixed solids, including narrow frames; never the player, sensors or invisible world limits. */
export const wingBlocks = (c: RAPIER.Collider) => !c.isSensor() && (c.parent()?.isFixed() ?? true) && c.collisionGroups() !== BOUNDARY_GROUPS;
const samples = [[-1, 0], [0, 0], [1, 0], [0, 1]] as const;
export function createWingClearance(w: ArchangelWings, world: RAPIER.World, api: Pick<typeof RAPIER, 'Cuboid'>) {
  const probes = [createWingEnvelope(w.left), createWingEnvelope(w.right)], inverse = new Matrix4();
  const shape = new api.Cuboid(1, 1, 1), centre = new Vector3(), size = new Vector3(), rotation = new Quaternion();
  const states = [{ hold: 0, target: 0 }, { hold: 0, target: 0 }];
  const stats = { queries: 0, constrained: false };
  let reserveBeat = true;
  const clear = (side: number, tuck: number, velocity: Vec, forecast: boolean) => {
    const probe = probes[side < 0 ? 0 : 1], wing = side < 0 ? w.left : w.right, m = w.motion, stroke = m.stroke, recovery = m.recovery;
    // Reserve the current flight state's entire beat. A hover beside a wall must not wait for a vane to hit it.
    if (forecast && reserveBeat) for (let i = 0; i < samples.length; i++) {
      [m.stroke, m.recovery] = samples[i]; poseArchangelWing(w, side, tuck); wing.root.updateMatrixWorld(true); probe.update(inverse, i > 0);
    }
    else { poseArchangelWing(w, side, tuck); wing.root.updateMatrixWorld(true); probe.update(inverse); }
    m.stroke = stroke; m.recovery = recovery;
    for (const b of probe.bounds) {
      b.getCenter(centre).applyMatrix4(w.root.matrixWorld); b.getSize(size).multiplyScalar(.5).addScalar(forecast ? WING_CLEARANCE.margin : .025);
      shape.halfExtents.x = size.x; shape.halfExtents.y = size.y; shape.halfExtents.z = size.z;
      stats.queries++;
      if (world.intersectionWithShape(centre, rotation, shape, undefined, undefined, undefined, undefined, wingBlocks)) return false;
      if (forecast && Math.hypot(velocity.x, velocity.y, velocity.z) > .05) {
        stats.queries++;
        if (world.castShape(centre, rotation, velocity, shape, 0, WING_CLEARANCE.lookAhead, true, undefined, undefined, undefined, undefined, wingBlocks)) return false;
      }
    }
    return true;
  };
  return { stats, states, step(velocity: Vec, dt: number, paused = false, reduced = false) {
    if (paused) return;
    stats.queries = 0; stats.constrained = false;
    reserveBeat = !reduced && (w.motion.amplitude > .001 || w.motion.glide < .999);
    w.root.updateWorldMatrix(true, true); inverse.copy(w.root.matrixWorld).invert(); w.root.getWorldQuaternion(rotation);
    const h = Math.max(0, Math.min(.1, dt));
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, key = i ? 'right' : 'left', state = states[i];
      if (w.motion.unfold < .02) { w.tuck[key] = 0; state.target = state.hold = 0; poseArchangelWing(w, side); continue; }
      let required = 0;
      if (w.motion.unfold > .02) while (required < 1 && !clear(side, required, velocity, true)) required += .125;
      if (required >= state.target && required > 0) { state.target = required; state.hold = WING_CLEARANCE.hold; }
      else { state.hold = Math.max(0, state.hold - h); if (!state.hold) state.target = required; }
      const previous = w.tuck[key], rate = state.target > previous ? WING_CLEARANCE.closeRate : WING_CLEARANCE.openRate;
      let next = reduced ? state.target : state.target + (previous - state.target) * Math.exp(-rate * h);
      // A sharp turn, checkpoint or stalled frame can consume the anticipation margin: keep the rendered surface outside stone now.
      while (next < 1 && !clear(side, next, velocity, false)) next = Math.min(1, next + .125);
      w.tuck[key] = next; poseArchangelWing(w, side);
      if (!clear(side, next, velocity, false)) stats.constrained = true;
      poseArchangelWing(w, side);
    }
    w.root.updateMatrixWorld(true);
  } };
}

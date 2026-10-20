// CameraRig owns the view. This query only shortens its boom when a pillar hides the attack target.
import type RAPIER from '@dimforge/rapier3d-compat';
import { ONLY_FIXED, SHOT_GROUPS, type Vec3 } from './combat';
export const createCombatSight = () => ({ distance: Infinity, hold: 0 });
function clear(world: RAPIER.World, ray: RAPIER.Ray, head: Vec3, boom: Vec3, target: Vec3, scale: number) {
  ray.origin.x = head.x + boom.x * scale; ray.origin.y = head.y + boom.y * scale; ray.origin.z = head.z + boom.z * scale;
  const x = target.x - ray.origin.x, y = target.y - ray.origin.y, z = target.z - ray.origin.z, distance = Math.hypot(x, y, z);
  if (distance < .5) return true;
  ray.dir.x = x / distance; ray.dir.y = y / distance; ray.dir.z = z / distance;
  return !world.castRay(ray, distance - .5, true, ONLY_FIXED, SHOT_GROUPS);
}
/** Retract immediately, find the obstruction edge accurately, then hold briefly before easing back out. No 20% zoom steps. */
export function clearCombatSight(world: RAPIER.World, ray: RAPIER.Ray, head: Vec3, boom: Vec3, target: Vec3,
  state = createCombatSight(), elapsed = 1 / 60) {
  const length = Math.hypot(boom.x, boom.y, boom.z), dt = Math.max(0, Math.min(.05, elapsed));
  if (length < .01) { state.distance = length; return; }
  let scale = 1;
  if (!clear(world, ray, head, boom, target, 1)) {
    for (let n = 1; n <= 5; n++) {
      const candidate = n === 5 ? .08 : 1 - n * .2;
      if (!clear(world, ray, head, boom, target, candidate)) continue;
      let lo = candidate, hi = 1 - (n - 1) * .2;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2;
        if (clear(world, ray, head, boom, target, mid)) lo = mid; else hi = mid;
      }
      const padded = Math.max(.01, lo - .04 / length);
      scale = clear(world, ray, head, boom, target, padded) ? padded : lo; break;
    }
  }
  const safe = length * scale;
  if (safe < state.distance - .001) { state.distance = safe; state.hold = .12; }
  else {
    state.hold = Math.max(0, state.hold - dt);
    if (state.hold === 0) state.distance = Math.min(safe, state.distance + 8 * dt);
  }
  let distance = Math.min(safe, state.distance);
  // A held radius may be obstructed after a turn even when the longer candidate is clear. Visibility wins over the release hold.
  if (distance < safe && !clear(world, ray, head, boom, target, distance / length)) {
    distance = safe; state.distance = safe; state.hold = .12;
  }
  boom.x *= distance / length; boom.y *= distance / length; boom.z *= distance / length;
}

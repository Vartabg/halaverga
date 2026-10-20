// Keep the attack target's sightline clear as well as the camera boom. A shoulder view can cut behind a pillar even when the
// angel has a clear strike path. Shorten that view before publishing it to enemy perception / targeting.
import type RAPIER from '@dimforge/rapier3d-compat';
import { ONLY_FIXED, SHOT_GROUPS, type Vec3 } from './combat';
const direction: Vec3 = { x: 0, y: 0, z: 0 };
export function clearCombatSight(world: RAPIER.World, ray: RAPIER.Ray, head: Vec3, boom: Vec3, target: Vec3) {
  const bx = boom.x, by = boom.y, bz = boom.z;
  for (let n = 0; n < 6; n++) {
    const scale = n === 5 ? .08 : 1 - n * .2;
    ray.origin.x = head.x + bx * scale; ray.origin.y = head.y + by * scale; ray.origin.z = head.z + bz * scale;
    direction.x = target.x - ray.origin.x; direction.y = target.y - ray.origin.y; direction.z = target.z - ray.origin.z;
    const distance = Math.hypot(direction.x, direction.y, direction.z);
    if (distance < .5) return;
    ray.dir.x = direction.x / distance; ray.dir.y = direction.y / distance; ray.dir.z = direction.z / distance;
    if (!world.castRay(ray, distance - .5, true, ONLY_FIXED, SHOT_GROUPS)) {
      boom.x = bx * scale; boom.y = by * scale; boom.z = bz * scale; return;
    }
  }
}

import type { ShooterState, Vec3 } from './combat';
import { battle, BATTLE } from './celestialBattle';
import { addTrauma } from './cameraFx';
import { flowWorld } from './combatFlow';
export const wardenWorld = flowWorld;
const a: Vec3 = { x: 0, y: 0, z: 0 }, b: Vec3 = { x: 0, y: 0, z: 0 };
const end: Vec3 = { x: 0, y: 0, z: 0 };
/** The shared aiming query omits its last0.5m. Extend that endpoint so a short attack segment tests its entire length. */
export function wardenSegment(from: Vec3, to: Vec3) {
  const x = to.x - from.x, y = to.y - from.y, z = to.z - from.z, length = Math.hypot(x, y, z);
  if (length < 1e-8) return true;
  end.x = to.x + x / length * .5; end.y = to.y + y / length * .5; end.z = to.z + z / length * .5;
  return wardenWorld.clear(from, end);
}
/** Center and six body-width rails, including the space above/below a committed lunge. */
export function wardenPath(from: Vec3, to: Vec3) {
  for (let n = 0; n < 7; n++) {
    const x = n === 1 ? 2.2 : n === 2 ? -2.2 : 0, y = n === 3 ? 2.2 : n === 4 ? -2.2 : 0;
    const z = n === 5 ? 2.2 : n === 6 ? -2.2 : 0;
    a.x = from.x + x; a.y = from.y + y; a.z = from.z + z;
    b.x = to.x + x; b.y = to.y + y; b.z = to.z + z;
    if (!wardenSegment(a, b)) return false;
  }
  return true;
}
export function wardenDamage(s: ShooterState) {
  if (battle.status !== 'battle' || battle.invulnerable > 0) return;
  battle.ward--; battle.invulnerable = BATTLE.grace; battle.hurt = .65; addTrauma(s.camFx, .45);
  if (battle.ward <= 0) { battle.status = 'fallen'; battle.charging = -1; }
}

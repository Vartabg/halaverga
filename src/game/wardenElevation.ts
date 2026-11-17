import { WATER_LEVEL } from './combat';
import { WORLD } from './motion';
import { heightAt } from '@/world/massifData';
/** Inter-exchange repositioning changes elevation. Existing swept navigation remains the sole enemy translation owner. */
export function wardenElevation(i: number, turn: number, playerY: number) {
  return i === 5 ? Math.max(18, Math.min(78, playerY + .5)) : Math.max(30, Math.min(72, playerY + (turn % 2 ? 12 : -8)));
}
/** The mountain is not a flat floor: a goal over a ridge is lifted clear of it, so a warden is never sent into the rock. The lift
 * wins over the band's top (a ridge can stand above it) and stops at the same ceiling margin the steering clamp uses. */
export const GROUND_CLEARANCE = 8;
export const clearOfGround = (x: number, y: number, z: number) =>
  Math.min(WORLD.ceiling - 10, Math.max(y, heightAt(x, z) + GROUND_CLEARANCE));
/** Where a flat ring of this radius rests: on the highest ground under it, and never under the water that fills the gorge. */
export function restingHeight(x: number, z: number, radius: number) {
  let y = Math.max(WATER_LEVEL, heightAt(x, z));
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; y = Math.max(y, heightAt(x + Math.cos(a) * radius, z + Math.sin(a) * radius)); }
  return y;
}

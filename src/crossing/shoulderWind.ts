import { shoulderAxis } from './passLandforms';
import { passGroundAt } from './passGround';

const ease = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
export const WIND_START = 16, WIND_END = 108;

/** Rising air spills over the first bed. Its strength is local to the slope and falls away above it. */
export function shoulderLift(x: number, y: number, z: number) {
  if (z <= WIND_START || z >= WIND_END) return 0;
  const across = Math.abs(x - shoulderAxis(z) + 2);
  if (across >= 17) return 0;
  const above = y - passGroundAt(x, z);
  return 2.35 * ease((z - WIND_START) / 18) * ease((WIND_END - z) / 24)
    * ease((17 - across) / 11) * ease(above / 3) * ease((51 - above) / 17);
}

import { SPEED, type Vec } from '@/game/motion';

export type ThermalRing = {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly boost: readonly [number, number, number];
  readonly radius: number;
  readonly tilt: readonly [number, number, number];
};

export const RING_TRIGGER_RADIUS = 6.5;
export const RING_COOLDOWN = 1.8;

/** Seven verified open-air Dawn Thermal Rings guiding the flyer from the arrival promontory through the Cloven Arch
 * and up to the High Sanctuary of the Throne. Every ring sits off the x = 0, y = 20..25 straight test line. */
export const THERMAL_RINGS: readonly ThermalRing[] = [
  { id: 'south-tarn-approach', position: [-10, 14, 38], boost: [1.5, 2.2, -9.5], radius: 4.4, tilt: [0.18, -0.14, 0] },
  { id: 'tarn-surface-skim', position: [-6, 9, 16], boost: [1.4, 1.8, -10.0], radius: 4.2, tilt: [0.12, -0.16, 0] },
  { id: 'cloven-arch-pass', position: [-3, 4.5, -1], boost: [3.2, 4.2, -9.8], radius: 3.8, tilt: [-0.22, -0.28, 0] },
  { id: 'north-basin-updraft', position: [6, 14, -24], boost: [1.2, 8.5, -5.5], radius: 4.5, tilt: [-0.62, -0.18, 0] },
  { id: 'sanctuary-ascent-lower', position: [6, 36, -32], boost: [2.8, 9.2, -3.2], radius: 4.6, tilt: [-0.78, -0.35, 0] },
  { id: 'sanctuary-ascent-upper', position: [12, 58, -36], boost: [4.2, 7.6, -2.0], radius: 4.6, tilt: [-0.68, -0.48, 0] },
  { id: 'high-sanctuary-crown', position: [20, 72, -38], boost: [3.5, 4.0, -1.5], radius: 5.0, tilt: [-0.35, -0.55, 0] },
] as const;

export const windState = { boostTimer: 0, lastRing: -1 };

export function resetWindState(cooldowns?: Float64Array) {
  windState.boostTimer = 0;
  windState.lastRing = -1;
  cooldowns?.fill(-Infinity);
}

/** Pure thermal ring check and velocity boost; returns index of triggered ring or -1. */
export function stepThermalRings(
  pos: Vec,
  vel: Vec,
  flying: boolean,
  landing: boolean,
  paused: boolean,
  t: number,
  dt: number,
  cooldowns: Float64Array,
): number {
  if (paused) return -1;
  windState.boostTimer = Math.max(0, windState.boostTimer - Math.min(Math.max(dt, 0), 0.1));
  if (!flying || landing) return -1;
  for (let i = 0; i < THERMAL_RINGS.length; i++) {
    if (t - cooldowns[i] < RING_COOLDOWN) continue;
    const [rx, ry, rz] = THERMAL_RINGS[i].position;
    const dist = Math.hypot(pos.x - rx, pos.y - ry, pos.z - rz);
    if (dist <= RING_TRIGGER_RADIUS) {
      cooldowns[i] = t;
      windState.boostTimer = 3.0;
      windState.lastRing = i;
      const [bx, by, bz] = THERMAL_RINGS[i].boost;
      vel.x += bx;
      vel.y += by;
      vel.z += bz;
      const speed = Math.hypot(vel.x, vel.y, vel.z);
      if (speed > SPEED.surge) {
        const scale = SPEED.surge / speed;
        vel.x *= scale; vel.y *= scale; vel.z *= scale;
      }
      return i;
    }
  }
  return -1;
}

import { type Vec } from '@/game/motion';
import { restingHeight } from '@/game/wardenElevation';
import { ARCH, archSection } from '@/world/archData';
import { heightAt } from '@/world/massifData';

const eastFoot = archSection((24 - ARCH.x0) / (ARCH.x1 - ARCH.x0));
const arrivalY = Math.max(eastFoot.cy + eastFoot.ry, heightAt(24, eastFoot.cz)) + 3.2;
export const ARRIVAL = 8.1;
const path = [
  { t: 0, x: -31, y: 24, z: 111 },
  { t: 2.6, x: -26, y: 12, z: 88 },
  { t: 3.8, x: -23, y: 10, z: 73 },
  { t: 4.45, x: -24, y: 12, z: 63 },
  { t: 4.95, x: -20, y: 16, z: 49 },
  { t: 5.45, x: -3, y: 19, z: 38 },
  { t: 5.9, x: 13, y: 25.5, z: 36 },
  { t: 6.35, x: 23, y: 34, z: 35 },
  { t: 6.9, x: 25, y: 33, z: 27 },
  { t: ARRIVAL, x: 24, y: arrivalY, z: eastFoot.cz + .7 },
] as const;

/** The Watcher flies the same continuous curve whether the pilot dives, climbs or misses. */
export function watcherAt(time: number, out: Vec) {
  let i = 0;
  while (i < path.length - 2 && time > path[i + 1].t) i++;
  const a = path[i], b = path[i + 1], prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 2)];
  const span = b.t - a.t, u = Math.max(0, Math.min(1, (time - a.t) / span)), ease = u * u * (3 - 2 * u);
  const leave = span * u * (1 - u) ** 2 / (b.t - prev.t);
  const arrive = span * u * u * (u - 1) / (next.t - a.t);
  for (const axis of ['x', 'y', 'z'] as const) {
    out[axis] = a[axis] + (b[axis] - a[axis]) * ease + (b[axis] - prev[axis]) * leave + (next[axis] - a[axis]) * arrive;
  }
}

// The steep facets span several metres of the analytic slope. The wings fold in for a sword approach.
const SPREAD = 3.2, FOLDED = 1;
const nearArch = (x: number, z: number) => x >= ARCH.x0 && x <= ARCH.x1 && Math.abs(z - ARCH.z) < 8;
const section = (x: number) => archSection((x - ARCH.x0) / (ARCH.x1 - ARCH.x0));
const GROUND_CLEARANCE = 2.3, ARCH_CLEARANCE = 1.8;

/** Damp an approach to the ground, then slide along the inflated ellipse if the pilot clips the rock span. */
export function clearRock(p: Vec, v: Vec, folded: boolean) {
  const wing = folded ? FOLDED : SPREAD;
  const floor = restingHeight(p.x, p.z, wing) + GROUND_CLEARANCE;
  const ahead = restingHeight(p.x + v.x * .3, p.z + v.z * .3, wing) + GROUND_CLEARANCE;
  v.y = Math.max(v.y, Math.min(20, (ahead - p.y) / .3));
  if (p.y < floor) { p.y = floor; v.y = Math.max(0, v.y); }
  if (!nearArch(p.x, p.z)) return;
  const s = section(p.x), ry = s.ry + ARCH_CLEARANCE, rz = s.rz + ARCH_CLEARANCE;
  const dy = (p.y - s.cy) / ry, dz = (p.z - s.cz) / rz, length = Math.hypot(dy, dz);
  if (length >= 1) return;
  const uy = length > .0001 ? dy / length : 1, uz = length > .0001 ? dz / length : 0;
  // Near a foot the hillside can close off the underside. Stay on the approach side until there is room above or below.
  if (s.cy + uy * ry < restingHeight(p.x, s.cz + uz * rz, wing) + GROUND_CLEARANCE) {
    const side = Math.sign(uz) || 1;
    p.z = s.cz + side * rz;
    p.y = Math.max(p.y, restingHeight(p.x, p.z, wing) + GROUND_CLEARANCE);
    if (v.z * side < 0) v.z = 0;
    return;
  }
  p.y = s.cy + uy * ry;
  p.z = s.cz + uz * rz;
  const ny = uy / ry, nz = uz / rz, nx = -s.slope * ny;
  const into = Math.min(0, v.x * nx + v.y * ny + v.z * nz) / (nx * nx + ny * ny + nz * nz);
  v.x -= nx * into; v.y -= ny * into; v.z -= nz * into;
}

/** Check a short sword approach against the relief and the actual arch opening, including its underside. */
export function clearApproach(a: Vec, b: Vec, distance: number) {
  const steps = Math.ceil(distance / .8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    if (y < restingHeight(x, z, FOLDED) + GROUND_CLEARANCE) return false;
    if (nearArch(x, z)) {
      const s = section(x);
      if (((y - s.cy) / (s.ry + ARCH_CLEARANCE)) ** 2 + ((z - s.cz) / (s.rz + ARCH_CLEARANCE)) ** 2 < 1) return false;
    }
  }
  return true;
}

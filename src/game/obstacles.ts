// What a thrown body can strike besides the mountain itself (thrown.ts): the standing stones and the rock arch. The world hands
// over the stones it draws (HermonCity.tsx, recorded by the same kit call that builds each one), so a collider is always a drawn
// stone, and the arch shares its section with its mesh (world/archData.ts). For thrown bodies only: the flying angel still passes
// through the shafts, because colliders on them change the flight-escape routes (see steleData.ts). Pure and allocation-free.
import type { Vec3 } from './combat';
import { ARCH, archSection } from '@/world/archData';

/** An upright worked stone: its centre, its height, and its radius at the top and at the foot. */
export type Stone = { x: number; y: number; z: number; h: number; top: number; bottom: number };
export type Normal = { nx: number; ny: number; nz: number };
/** skin: a ball this close to a surface is on it, not in it. deep: no flight puts a ball this far (m) into rock in one step, so
 *  one found there began inside (a demon held in a shaft the angel flew through) and is let out, not thrown out. cap: the arch's
 *  ends are rounded off over this many metres, so a body crossing a foot of the arch along its bank meets a slope, not a step. */
export const SOLID = { skin: 1e-9, deep: 1.5, cap: 3 } as const;
const SKIN = SOLID.skin, DEEP = SOLID.deep, CAP = SOLID.cap;
const stones: Stone[] = [], sec = archSection(0);
let arch = false;

/** The obstacles as drawn. Called when the mountain mounts, and with none when it unmounts. */
export function setObstacles(list: readonly Stone[], withArch: boolean) {
  stones.length = 0; for (const s of list) stones.push(s);
  arch = withArch;
}
export const obstacleCount = () => stones.length + (arch ? 1 : 0);

/** A ball of radius r at p, moving at v, against the stones and the arch. Inside one: p is moved out to its surface, `out`
 *  takes the surface normal there, and the answer is true. One obstacle a call: the caller asks again, since stones stand on and
 *  against each other, and a ball already moved out to a surface is not in it (or the first stone would answer for ever). */
export function strikeObstacle(p: Vec3, v: Vec3, r: number, out: Normal): boolean {
  for (let i = 0; i < stones.length; i++) {
    const s = stones[i], foot = s.y - s.h / 2, head = foot + s.h;
    if (p.y < foot - r || p.y >= head + r - SKIN) continue;
    const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), t = Math.min(1, Math.max(0, (p.y - foot) / s.h));
    const reach = s.bottom + (s.top - s.bottom) * t + r, side = reach - d, up = head + r - p.y;
    if (side <= SKIN) continue;
    // The level way out; dead on its axis there is no nearest side, so back the way it came.
    const flat = Math.hypot(v.x, v.z), ux = d > 1e-4 ? dx / d : flat > 1e-4 ? -v.x / flat : 1, uz = d > 1e-4 ? dz / d : flat > 1e-4 ? -v.z / flat : 0;
    if (p.y > head && d > s.top) {
      // Over the rim of its head: the rim is round to a ball, so one that clips it is turned off it and one past it is not held up by air.
      const ex = d - s.top, ey = p.y - head, l = Math.hypot(ex, ey);
      if (l >= r - SKIN) continue;
      const k = r / l, far = s.top + ex * k;
      p.x = s.x + ux * far; p.z = s.z + uz * far; p.y = head + ey * k; out.nx = ux * ex / l; out.ny = ey / l; out.nz = uz * ex / l;
      return true;
    }
    if (Math.min(side, up) > DEEP) continue;
    // Whichever way out is shorter: up onto its head, or out through its side (which leans back as the stone narrows).
    if (up < side) { p.y = head + r; out.nx = 0; out.ny = 1; out.nz = 0; return true; }
    const lean = (s.bottom - s.top) / s.h, n = Math.hypot(1, lean);
    p.x = s.x + ux * reach; p.z = s.z + uz * reach; out.nx = ux / n; out.ny = lean / n; out.nz = uz / n;
    return true;
  }
  if (!arch || p.x <= ARCH.x0 || p.x >= ARCH.x1) return false;
  archSection((p.x - ARCH.x0) / (ARCH.x1 - ARCH.x0), sec);
  const edge = Math.min(p.x - ARCH.x0, ARCH.x1 - p.x), cap = edge >= CAP ? 1 : Math.sqrt(1 - (1 - edge / CAP) ** 2);
  const ay = (sec.ry + r) * cap, az = (sec.rz + r) * cap;
  if (ay < 1e-3) return false;
  const uy = (p.y - sec.cy) / ay, uz = (p.z - sec.cz) / az, e = Math.hypot(uy, uz);
  if (e >= 1 - SKIN || (1 - e) * Math.min(ay, az) > DEEP) return false;
  // Out along the line from the arch's core to its skin; from the core itself, upward.
  const ky = e > 1e-4 ? uy / e : 1, kz = e > 1e-4 ? uz / e : 0;
  p.y = sec.cy + ky * ay; p.z = sec.cz + kz * az;
  // The skin's normal: the ellipse's own, leaned along the span by how steeply the arch climbs there.
  const ny = ky / ay, nz = kz / az, nx = -ny * sec.slope, l = Math.hypot(nx, ny, nz);
  out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
  return true;
}
const probe: Vec3 = { x: 0, y: 0, z: 0 }, spare: Normal = { nx: 0, ny: 1, nz: 0 };
/** Whether a ball at p is still inside a stone or the arch (nothing is moved). */
export function insideObstacle(p: Vec3, v: Vec3, r: number) {
  probe.x = p.x; probe.y = p.y; probe.z = p.z;
  return strikeObstacle(probe, v, r, spare);
}

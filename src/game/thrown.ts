// Thrown bodies (Garo 2026-11-10: "add the physics to the fight scenes"). A demon the sword has struck is a projectile: the blow
// gives it a velocity, and gravity, air drag and the mountain decide the rest. It bounces off slopes, stops against cliff faces,
// splashes into the gorge water, strikes the standing stones and the arch (obstacles.ts) and shoves any demon in its path. The
// ground is the same height sampler the terrain is built from.
// Pure and allocation-free; banish.ts decides what an impact means.
import { WATER_LEVEL, droneAlive, type ShooterState, type Vec3 } from './combat';
import type { BanishState } from './banishState';
import { REEL } from './swordString';
import { heightAt } from '@/world/massifData';
import { insideObstacle, strikeObstacle, type Normal } from './obstacles';

/** gravity m/s2 (the world's own). float: gravity scale while a wounded demon reels, so it hangs for the next cut. drag 1/s.
 * bounce / grip: restitution and tangential loss on a real impact. rub: friction (1/s) while it rests or slides, so a body on a
 * slope behaves the same at any frame rate. stride: longest sub-step (m). wall: a contact this far under the
 * surface is a cliff face, not a slope. thud: slowest contact (m/s) that counts as an impact. settle / spent / timeout: seconds a
 * cast-down demon lies where it landed, how much of its speed is left once it has, and the longest a cast may last. reach / share / keep: demon-to-demon contact. */
export const THROWN = { gravity: 22, float: .34, drag: 1.5, spikeDrag: .12, bounce: .38, grip: .4, rub: 3, radius: .9, stride: 1.2, wall: 1.6,
  thud: 7, settle: .38, spent: .4, timeout: 2.4, reach: 1.9, share: .35, keep: .65 } as const;
/** The hardest contact of a step: speed into the surface, where, the surface normal, and the demon struck (-1: the world). */
export type Impact = { speed: number; x: number; y: number; z: number; nx: number; ny: number; nz: number; other: number };
const impact: Impact = { speed: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, other: -1 }, on: Normal = { nx: 0, ny: 1, nz: 0 };
export const floorAt = (x: number, z: number) => Math.max(WATER_LEVEL, heightAt(x, z));

/** A surface with normal n, touched at c: reflect what goes into it (with loss) and let it drag on what slides along it. A hard
 * strike spends itself there: the harder it lands, the less of it comes back. Returns the hardest contact speed so far. */
function rebound(v: Vec3, nx: number, ny: number, nz: number, h: number, cx: number, cy: number, cz: number, hard: number) {
  const into = v.x * nx + v.y * ny + v.z * nz;
  if (into >= 0) return hard;
  const tx = v.x - into * nx, ty = v.y - into * ny, tz = v.z - into * nz, keep = -into > THROWN.thud ? 1 - THROWN.grip : Math.exp(-THROWN.rub * h);
  const back = THROWN.bounce * Math.max(.35, Math.min(1, 1 - (-into - 10) / 80));
  v.x = tx * keep - into * back * nx; v.y = ty * keep - into * back * ny; v.z = tz * keep - into * back * nz;
  if (-into <= hard) return hard;
  impact.speed = -into; impact.x = cx; impact.y = cy; impact.z = cz; impact.nx = nx; impact.ny = ny; impact.nz = nz; impact.other = -1;
  return -into;
}
/** One body, one step: gravity, drag, the mountain, then the stones and the arch. Returns the hardest contact of the step, or
 * null. The result is reused. */
export function stepBody(p: Vec3, v: Vec3, dt: number, gravity: number, drag: number): Impact | null {
  const speed = Math.hypot(v.x, v.y, v.z), n = Math.min(8, Math.max(1, Math.ceil(speed * dt / THROWN.stride))), h = dt / n, r = THROWN.radius;
  let hard = 0;
  for (let k = 0; k < n; k++) {
    const d = Math.exp(-drag * h), fromX = p.x, fromY = p.y, fromZ = p.z;
    v.y -= gravity * h; v.x *= d; v.y *= d; v.z *= d;
    p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
    const under = floorAt(p.x, p.z) + r - p.y;
    if (under > 0) {
      let nx = 0, ny = 1, nz = 0;
      if (under > THROWN.wall && Math.hypot(v.x, v.z) > .01) {
        // A cliff face: step back out of the rock and bounce off the face, never up onto the top of it.
        p.x -= v.x * h; p.y -= v.y * h; p.z -= v.z * h;
        const gx = floorAt(p.x + 2, p.z) - floorAt(p.x - 2, p.z), gz = floorAt(p.x, p.z + 2) - floorAt(p.x, p.z - 2), g = Math.hypot(gx, gz);
        const flat = Math.hypot(v.x, v.z) || 1;
        if (g > 1) { nx = -gx / g; nz = -gz / g; } else { nx = -v.x / flat; nz = -v.z / flat; }
        ny = 0;
      } else {
        const gx = (floorAt(p.x + 1, p.z) - floorAt(p.x - 1, p.z)) / 2, gz = (floorAt(p.x, p.z + 1) - floorAt(p.x, p.z - 1)) / 2, l = Math.hypot(gx, 1, gz);
        nx = -gx / l; ny = 1 / l; nz = -gz / l; p.y += under;
      }
      hard = rebound(v, nx, ny, nz, h, p.x, p.y - r * ny, p.z, hard);
    }
    // A standing stone or the arch: out to its face (and never left under the ground beside it), then off it like any rock.
    // Stones stand on and against each other (a crown on its shaft, a waystone at a megalith's foot), so look again after each.
    let touched = false;
    for (let pass = 0; pass < 4 && strikeObstacle(p, v, r, on); pass++) {
      const low = floorAt(p.x, p.z) + r; if (p.y < low) p.y = low;
      hard = rebound(v, on.nx, on.ny, on.nz, h, p.x - on.nx * r, p.y - on.ny * r, p.z - on.nz * r, hard);
      touched = true;
    }
    // Wedged (the notch between two stones, the arch's underside against its bank): no way out was found, so it stays where this
    // step began, which was clear, and keeps the speed the rock gave it back.
    if (touched && insideObstacle(p, v, r)) { p.x = fromX; p.y = fromY; p.z = fromZ; }
  }
  return hard > 0 ? impact : null;
}
/** A thrown demon meets another: it shoves it (once per throw) and loses part of its own speed. */
function strikeBystander(b: BanishState, s: ShooterState, i: number): Impact | null {
  const f = s.drones, p = f.pos[i], v = b.vel[i], speed = Math.hypot(v.x, v.y, v.z);
  if (speed < THROWN.thud) return null;
  for (let j = 0; j < f.count; j++) {
    if (j === i || b.struck[i] & 1 << j || f.held[j] || !droneAlive(f, j)) continue;
    const q = f.pos[j], x = p.x - q.x, y = p.y - q.y, z = p.z - q.z, d = Math.hypot(x, y, z);
    if (d > THROWN.reach) continue;
    b.struck[i] |= 1 << j;
    const k = f.knockV[j]; k.x += v.x * THROWN.share; k.y += v.y * THROWN.share; k.z += v.z * THROWN.share;
    f.wobbleV[j] += 6; f.tint[j] = .35; f.lastHit[j] = s.clock;
    v.x *= THROWN.keep; v.y *= THROWN.keep; v.z *= THROWN.keep;
    impact.speed = speed; impact.x = (p.x + q.x) / 2; impact.y = (p.y + q.y) / 2; impact.z = (p.z + q.z) / 2;
    impact.nx = d > .01 ? x / d : 0; impact.ny = d > .01 ? y / d : 1; impact.nz = d > .01 ? z / d : 0; impact.other = j;
    return impact;
  }
  return null;
}
/** A wounded demon between cuts: it rides the blow under a light gravity, so it hangs for the next cut, and carries its wound. */
export function reelDemon(b: BanishState, s: ShooterState, i: number, dt: number): Impact | null {
  const f = s.drones, hit = stepBody(f.pos[i], b.vel[i], dt, THROWN.gravity * THROWN.float, THROWN.drag);
  const to = REEL[Math.min(REEL.length - 1, b.wounds[i])], k = 1 - Math.exp(-10 * dt), side = i % 2 ? -1 : 1;
  f.tiltX[i] += (to.x - f.tiltX[i]) * k; f.tiltZ[i] += (to.z * side - f.tiltZ[i]) * k;
  return hit ?? strikeBystander(b, s, i);
}
/** Cast down: full gravity, almost no drag, tumbling end over end until it strikes. */
export function spikeDemon(b: BanishState, s: ShooterState, i: number, dt: number): Impact | null {
  const f = s.drones, hit = stepBody(f.pos[i], b.vel[i], dt, THROWN.gravity, THROWN.spikeDrag);
  f.tiltX[i] += b.spin[i] * dt; if (hit) b.spin[i] *= -.45;
  return hit ?? strikeBystander(b, s, i);
}

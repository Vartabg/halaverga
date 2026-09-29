import { WORLD, FOOT, FLIGHT_FLOOR as FLOOR, type Vec } from './motion';
import arrival from '../content/arrival.json';
// brake: the one soft limiter's deceleration (m/s2). Was 65, which the 60 Hz stop turned into peaks of 105-152 (about 8 g, 34 m/s to 0
// in 0.43 s); 30 keeps the same stop point (buffer) and ramps a surge stop over 1.1 s (limits plan S2, 2026-09-28).
export const CLEARANCE = { margin: .04, brake: 30, lookAhead: .25, buffer: .45 };
const STEP = 1 / 60;
/** The fastest closing speed that still stops `distance` short of the buffer at CLEARANCE.brake, counted per 60 Hz step: the
 *  closing speed then drops by exactly brake x step a frame, never more (the continuous sqrt(2 a d) overshoots that near zero). */
export function allowedClosing(distance: number) {
  const a = CLEARANCE.brake, half = a * STEP / 2;
  return Math.sqrt(half * half + 2 * a * Math.max(0, distance - CLEARANCE.buffer)) - half;
}
export const BUILDING_ROUTE = [
  { id: 'arrival', label: 'Arrival terrace', x: 0, y: 20 + FOOT, z: 65 },
  { id: 'lift', label: 'Vertical departure', x: 0, y: 26, z: 65 },
  { id: 'launch', label: 'Departure', x: 0, y: 26, z: 47 },
  { id: 'boulevard', label: 'Water corridor', x: 0, y: 3.2, z: 22 },
  { id: 'viaduct', label: 'Viaduct opening', x: -3, y: 3.2, z: -1 },
  { id: 'north', label: 'North boulevard', x: 0, y: 8, z: -27 },
  { id: 'ascent', label: 'Tower approach', x: 9, y: 69, z: -38 },
  { id: 'roof', label: 'Marked tower roof', x: 30, y: 69, z: -38 },
] as const;
// Discoverable story terminals: physical spots paired with the record a
// player recovers there. Adding a terminal is a content change — Player.tsx
// reads this table without flight-loop edits.
export interface Terminal { id: string; position: Vec; radius: number; location: string; record: typeof arrival }
export const TERMINALS: Terminal[] = [
  { id: 'municipal-memory-07', position: { x: -7, y: 21, z: 58 }, radius: 5, location: 'Municipal terminal', record: arrival },
];
export function nearestTerminal(position: Vec): Terminal | null {
  for (const terminal of TERMINALS) {
    const { x, y, z } = terminal.position;
    if (Math.hypot(position.x - x, position.y - y, position.z - z) < terminal.radius) return terminal;
  }
  return null;
}
export function boundaryDistance(p: Vec) {
  return Math.min(p.x - WORLD.minX, WORLD.maxX - p.x, p.z - WORLD.minZ, WORLD.maxZ - p.z, WORLD.ceiling - p.y);
}
export function limitApproach(velocity: Vec, normal: Vec, distance: number) {
  const closing = -(velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z);
  const allowed = allowedClosing(distance);
  const correction = Math.max(0, closing - allowed);
  return { x: velocity.x + normal.x * correction, y: velocity.y + normal.y * correction, z: velocity.z + normal.z * correction };
}
/** Where a suit stops short of a wall or the ceiling: the plane offsets that keep the old stop points (1.14 m from a wall, where the
 *  flight sweep used to meet the invisible collider; 0.54 m under the ceiling; the floor is the clamp itself). */
const WALL_GAP = .69, CEILING_GAP = .09;
/**
 * The soft limiter's ramp also holds against a push the other way (limits review, F12). Closing speed only drops 30 m/s2 while the
 * limiter ramps, but a suit that turns away as it brakes has its thrust re-aimed outward in the same frames: the velocity blend then
 * adds up to 40 m/s2 more, and the last metre of a surge stop measured 38-42. While a face is in the ramp (previous closing within one
 * step of the cap), the closing speed may not fall more than brake x step below where it was: the turn-away thrust waits for the ramp.
 */
export function paceClosing(p: Vec, prev: Vec, v: Vec): Vec {
  let r = v;
  for (const [n, distance] of PLANES(p)) {
    const before = -(prev.x * n.x + prev.y * n.y + prev.z * n.z);
    if (before <= 0 || before < allowedClosing(distance) - CLEARANCE.brake * STEP) continue;
    const now = -(r.x * n.x + r.y * n.y + r.z * n.z), floor = before - CLEARANCE.brake * STEP;
    if (now < floor) r = { x: r.x - n.x * (floor - now), y: r.y - n.y * (floor - now), z: r.z - n.z * (floor - now) };
  }
  return r;
}
/** The six faces: inward normal and the plane distance the soft limiter counts from (see WALL_GAP and CEILING_GAP). */
const PLANES = (p: Vec) => [
  [{ x: 1, y: 0, z: 0 }, p.x - WORLD.minX - WALL_GAP], [{ x: -1, y: 0, z: 0 }, WORLD.maxX - p.x - WALL_GAP],
  [{ x: 0, y: 0, z: 1 }, p.z - WORLD.minZ - WALL_GAP], [{ x: 0, y: 0, z: -1 }, WORLD.maxZ - p.z - WALL_GAP],
  [{ x: 0, y: -1, z: 0 }, WORLD.ceiling - p.y - CEILING_GAP], [{ x: 0, y: 1, z: 0 }, p.y - FLOOR + CLEARANCE.buffer],
] as const;
/** The one soft limiter for the six district faces: closing speed is capped by allowedClosing of the plane distance. */
export function softenBounds(p: Vec, v: Vec): Vec {
  let result = v;
  for (const [normal, distance] of PLANES(p)) result = limitApproach(result, normal, distance);
  return result;
}
/**
 * Ceiling and floor keep the commanded speed (limits plan S5a). The soft limiter takes the closing part away, and the slide that
 * is left ran at speed x cos(pitch): 32-90% of what the pilot asked for. Within SLIDE_ZONE of a surface the commanded vector pushes
 * into, the horizontal speed rises toward sqrt(commanded^2 - vy^2), so the suit slides at full speed. Full weight from 2 m in.
 */
export const SLIDE_ZONE = 4;
/** `peel`: +1 while the pitch peel is leaving the ceiling, -1 the floor (the slide keeps its speed through the peel too), else 0. */
export function keepSlide(p: Vec, v: Vec, target: Vec, peel = 0): Vec {
  const up = peel ? peel > 0 : target.y > 0, into = peel ? 1 : up ? target.y : -target.y;
  const distance = up ? WORLD.ceiling - p.y : p.y - FLOOR;
  if (into < .5 || distance >= SLIDE_ZONE) return v;
  const u = Math.min(1, Math.max(0, (SLIDE_ZONE - distance) / (SLIDE_ZONE - 2))), weight = u * u * (3 - 2 * u);
  const h = Math.hypot(v.x, v.z), commanded = Math.hypot(target.x, target.y, target.z);
  const goal = peel ? commanded : Math.sqrt(Math.max(0, commanded * commanded - v.y * v.y));
  // Only along the way the suit is already commanded to go: a suit still moving against its command (turning back) is not sped up.
  if (goal <= h || v.x * target.x + v.z * target.z < 0) return v;
  const next = h + (goal - h) * weight;
  if (h > 1e-6) return { x: v.x * next / h, y: v.y, z: v.z * next / h };
  const th = Math.hypot(target.x, target.z);
  return th > 1e-6 ? { x: target.x / th * next, y: v.y, z: target.z / th * next } : v;
}
export function removeInward(velocity: Vec, normal: Vec) {
  const closing = Math.min(0, velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z);
  return { x: velocity.x - normal.x * closing, y: velocity.y - normal.y * closing, z: velocity.z - normal.z * closing };
}

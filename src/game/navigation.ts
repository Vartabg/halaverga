import { WORLD, FOOT, type Vec } from './motion';
export const CLEARANCE = { margin: .04, brake: 65, lookAhead: .25, buffer: .45 };
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
export function boundaryDistance(p: Vec) {
  return Math.min(p.x - WORLD.minX, WORLD.maxX - p.x, p.z - WORLD.minZ, WORLD.maxZ - p.z, WORLD.ceiling - p.y);
}
export function limitApproach(velocity: Vec, normal: Vec, distance: number) {
  const closing = -(velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z);
  const allowed = Math.sqrt(2 * CLEARANCE.brake * Math.max(0, distance - CLEARANCE.buffer));
  const correction = Math.max(0, closing - allowed);
  return { x: velocity.x + normal.x * correction, y: velocity.y + normal.y * correction, z: velocity.z + normal.z * correction };
}
export function softenBounds(p: Vec, v: Vec): Vec {
  let result = v;
  for (const [normal, distance] of [
    [{ x: 1, y: 0, z: 0 }, p.x - WORLD.minX], [{ x: -1, y: 0, z: 0 }, WORLD.maxX - p.x],
    [{ x: 0, y: 0, z: 1 }, p.z - WORLD.minZ], [{ x: 0, y: 0, z: -1 }, WORLD.maxZ - p.z],
    [{ x: 0, y: -1, z: 0 }, WORLD.ceiling - p.y], [{ x: 0, y: 1, z: 0 }, p.y - 1.7 + CLEARANCE.buffer],
  ] as const) result = limitApproach(result, normal, distance);
  return result;
}
export function removeInward(velocity: Vec, normal: Vec) {
  const closing = Math.min(0, velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z);
  return { x: velocity.x - normal.x * closing, y: velocity.y - normal.y * closing, z: velocity.z - normal.z * closing };
}

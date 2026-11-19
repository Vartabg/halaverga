import { hash2 } from '@/world/massifData';
import { passGroundAt } from './passGround';

type Point = [number, number, number];
type Face = [Point, Point, Point];
type Fragment = { x: number; z: number; radius: number; faces: Face[] };
const fans = [
  // Centre, spread along the fall line, largest piece, count.
  [30, 55, 8, 21, 2.4, 45], [44, 87, 10, 22, 3.2, 39], [50, 34, 12, 13, 2.8, 27],
  [16, 18, 5, 10, 1.2, 18], [-52, 78, 7, 27, 2.1, 45], [-39, 46, 12, 8, 1.5, 20],
  [-65, 105, 5, 20, 2.3, 26], [-51, -77, 16, 20, 1.8, 23], [23, -90, 21, 30, 1.9, 28],
];
const bucket = (x: number, z: number) => Math.floor(x / 10) * 1000 + Math.floor(z / 10);
let retained: { chunks: Fragment[]; cells: Map<number, Fragment[]> } | undefined;

/** Flat-topped pieces cleave along the adjacent beds. Their buried edges follow the actual slope. */
export function talusField() {
  if (retained) return retained;
  const chunks: Fragment[] = [], cells = new Map<number, Fragment[]>();
  for (const [cx, cz, spreadX, spreadZ, largest, count] of fans) for (let i = 0; i < count; i++) {
    const random = (key: number) => hash2(i + cx, key + cz, 7291);
    const z = cz + (random(1) + random(2) - 1) * spreadZ;
    const x = cx + (random(3) + random(4) - 1) * spreadX + (z - cz) * .18;
    const slope = Math.hypot(passGroundAt(x + 1, z) - passGroundAt(x - 1, z), passGroundAt(x, z + 1) - passGroundAt(x, z - 1)) / 2;
    if (slope > .9) continue;
    const a = .33 + largest * .85 * random(5) ** 2.5, b = a * (.45 + .37 * random(6));
    const high = a * (.23 + .21 * random(7)), yaw = 1.05 + random(8) * .84;
    const faces: Face[] = [], foot: Point[] = [], crown: Point[] = [];
    const centre: Point = [x, passGroundAt(x, z) + high, z];
    for (let j = 0; j < 6; j++) {
      const az = j * Math.PI / 3 + .2 * (random(j + 10) - .5);
      const u = a * Math.cos(az) * (.82 + random(20 + j) * .18), v = b * Math.sin(az);
      const dx = u * Math.cos(yaw) - v * Math.sin(yaw), dz = u * Math.sin(yaw) + v * Math.cos(yaw);
      const cap = .45 + random(j + 40) * .26, px = x + dx * cap + a * .06, pz = z + dz * cap;
      foot.push([x + dx, passGroundAt(x + dx, z + dz) - .16, z + dz]);
      crown.push([px, passGroundAt(px, pz) + high * (.65 + random(60 + j) * .25), pz]);
    }
    for (let j = 0; j < 6; j++) {
      const k = (j + 1) % 6;
      faces.push([foot[j], crown[j], foot[k]], [foot[k], crown[j], crown[k]], [crown[j], centre, crown[k]]);
    }
    const rock = { x, z, radius: a * 1.1, faces };
    chunks.push(rock);
    for (let ix = Math.floor((x - a * 1.1) / 10); ix <= Math.floor((x + a * 1.1) / 10); ix++) {
      for (let iz = Math.floor((z - a * 1.1) / 10); iz <= Math.floor((z + a * 1.1) / 10); iz++) {
        const key = ix * 1000 + iz, group = cells.get(key);
        if (group) group.push(rock); else cells.set(key, [rock]);
      }
    }
  }
  retained = { chunks, cells };
  return retained;
}

/** Height of the topmost triangle under a wing or foot, including loose joint blocks. */
export function passSurfaceAt(x: number, z: number) {
  let top = passGroundAt(x, z);
  const group = talusField().cells.get(bucket(x, z));
  if (!group) return top;
  for (const stone of group) {
    if (Math.abs(x - stone.x) > stone.radius || Math.abs(z - stone.z) > stone.radius) continue;
    for (const [a, b, c] of stone.faces) {
      const dx = x - a[0], dz = z - a[2], bx = b[0] - a[0], bz = b[2] - a[2], cx = c[0] - a[0], cz = c[2] - a[2];
      const area = bx * cz - cx * bz, u = (dx * cz - cx * dz) / area, v = (bx * dz - dx * bz) / area;
      if (u >= 0 && v >= 0 && u + v <= 1) top = Math.max(top, a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]));
    }
  }
  return top;
}

const circle = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);
export function passFootprint(x: number, z: number, radius: number) {
  let ground = passSurfaceAt(x, z);
  for (const [dx, dz] of circle) ground = Math.max(ground, passSurfaceAt(x + radius * dx, z + radius * dz));
  return ground;
}

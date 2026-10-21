import { INK } from './paintInk';

/** One painted stone. Visual only. The terrace collider underneath is unchanged. */
export type Block = { x: number; y: number; z: number; w: number; h: number; d: number; color: string };

/** Bottom of the first course. Sits above the court skins. */
export const HOUSE_BASE = 20.2;
const COURSE = 0.34;
const THICK = 0.42;

export type House = { x: number; z: number; w: number; d: number; courses: number; door: 'px' | 'nx' | 'pz' | 'nz' };

/** Two stone houses ahead of the arrival path. The standing spot x -4..4, z 62..68 stays empty. */
export const HOUSES: House[] = [
  { x: -7.2, z: 57.2, w: 4.2, d: 3.2, courses: 7, door: 'px' },
  { x: 7.2, z: 57.6, w: 4.0, d: 3.2, courses: 6, door: 'nx' },
];

function run(out: Block[], along: 'x' | 'z', origin: number, cross: number, length: number, y: number, h: number, color: string, gap: boolean) {
  const n = Math.max(1, Math.round(length / 0.86));
  const size = length / n;
  for (let i = 0; i < n; i++) {
    const c = origin - length / 2 + size * (i + 0.5);
    if (gap && Math.abs(c - origin) < 0.55 + size * 0.5) continue;
    const stone = size * 0.9;
    if (along === 'x') out.push({ x: c, y, z: cross, w: stone, h, d: THICK, color });
    else out.push({ x: cross, y, z: c, w: THICK, h, d: stone, color });
  }
}

/** Stacked courses you can count. A door is a gap, not glass. No steel, no photo. */
export function houseBlocks(houses: House[] = HOUSES): Block[] {
  const out: Block[] = [];
  for (const house of houses) {
    const h = COURSE * 0.9;
    for (let i = 0; i < house.courses; i++) {
      const y = HOUSE_BASE + h / 2 + i * COURSE;
      const color = i % 2 === 0 ? INK.rock : INK.shaft;
      const gap = i < house.courses - 2;
      run(out, 'x', house.x, house.z - house.d / 2, house.w, y, h, color, gap && house.door === 'nz');
      run(out, 'x', house.x, house.z + house.d / 2, house.w, y, h, color, gap && house.door === 'pz');
      run(out, 'z', house.z, house.x - house.w / 2, house.d, y, h, color, gap && house.door === 'nx');
      run(out, 'z', house.z, house.x + house.w / 2, house.d, y, h, color, gap && house.door === 'px');
    }
    out.push({
      x: house.x, y: HOUSE_BASE + house.courses * COURSE + 0.1, z: house.z,
      w: house.w + 0.36, h: 0.2, d: house.d + 0.36, color: INK.cap,
    });
  }
  return out;
}

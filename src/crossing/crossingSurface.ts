import type { BufferGeometry } from 'three';
import { passSurfaceAt } from './passTalus';

export type WalkSurface = (x: number, z: number) => number;
type Face = { x: number; y: number; z: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; area: number };

/** Travelers can step from the bank onto the chipped crown. The camp uses the same triangulated ground as flight. */
export function crossingSurface(arch: BufferGeometry): WalkSurface {
  const faces: Face[] = [], p = arch.getAttribute('position');
  arch.computeBoundingBox();
  const bounds = arch.boundingBox!;
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const bx = p.getX(i + 1) - x, bz = p.getZ(i + 1) - z;
    const cx = p.getX(i + 2) - x, cz = p.getZ(i + 2) - z;
    const area = bx * cz - cx * bz;
    if (area < -.0001) faces.push({ x, y, z, bx, by: p.getY(i + 1) - y, bz, cx, cy: p.getY(i + 2) - y, cz, area });
  }
  return (x, z) => {
    let top = passSurfaceAt(x, z);
    if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z) return top;
    for (const f of faces) {
      const dx = x - f.x, dz = z - f.z, b = (dx * f.cz - f.cx * dz) / f.area, c = (f.bx * dz - dx * f.bz) / f.area;
      if (b >= -.00001 && c >= -.00001 && b + c <= 1.00001) top = Math.max(top, f.y + b * f.by + c * f.cy);
    }
    return top;
  };
}

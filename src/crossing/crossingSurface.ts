import type { BufferGeometry } from 'three';

export type WalkSurface = (x: number, z: number, fallback: number) => number;
type Face = { x: number; y: number; z: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; area: number };

/** The chipped crown and its banks differ slightly from their design curves. Keep only the actual upward triangles along the footpath. */
export function crossingSurface(meshes: BufferGeometry[]): WalkSurface {
  const faces: Face[] = [];
  for (const geometry of meshes) {
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      const bx = p.getX(i + 1) - x, bz = p.getZ(i + 1) - z;
      const cx = p.getX(i + 2) - x, cz = p.getZ(i + 2) - z;
      const area = bx * cz - cx * bz;
      if (area >= -.0001 || Math.min(z, z + bz, z + cz) > 14 || Math.max(z, z + bz, z + cz) < -3) continue;
      if (Math.min(x, x + bx, x + cx) > 41 || Math.max(x, x + bx, x + cx) < -40) continue;
      faces.push({ x, y, z, bx, by: p.getY(i + 1) - y, bz, cx, cy: p.getY(i + 2) - y, cz, area });
    }
  }
  return (x, z, fallback) => {
    let top = -Infinity;
    for (const f of faces) {
      const dx = x - f.x, dz = z - f.z, b = (dx * f.cz - f.cx * dz) / f.area, c = (f.bx * dz - dx * f.bz) / f.area;
      if (b >= -.00001 && c >= -.00001 && b + c <= 1.00001) top = Math.max(top, f.y + b * f.by + c * f.cy);
    }
    return Number.isFinite(top) ? top : fallback;
  };
}

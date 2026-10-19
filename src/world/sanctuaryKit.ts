import { BoxGeometry, BufferGeometry, CylinderGeometry, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Authored sanctuary kit. Three shared surfaces, one static collision mesh; no invisible city underneath. */
export function sanctuaryKit() {
  const parts: BufferGeometry[][] = [[], [], []];
  function add(g: BufferGeometry, material: number, x: number, y: number, z: number, rz = 0, ry = 0) {
    g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z);
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    parts[material].push(flat);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, m = 0, rz = 0, ry = 0) {
    add(new BoxGeometry(w, h, d), m, x, y, z, rz, ry);
  }
  function drum(x: number, y: number, z: number, r: number, h: number, m = 0, top = r) {
    add(new CylinderGeometry(top, r, h, 8), m, x, y, z);
  }
  function ring(x: number, y: number, z: number, r: number, tube: number, m = 1, arc = Math.PI * 2) {
    add(new TorusGeometry(r, tube, 5, 40, arc), m, x, y, z);
  }
  function column(x: number, base: number, z: number, height: number, r = 2) {
    drum(x, base + height / 2, z, r, height, 0, r * .72);
    for (const u of [0, .06, .94, 1]) drum(x, base + u * height, z, r * 1.32, .5, 1);
    for (let j = 0; j < 8; j++) {
      const a = j * Math.PI / 4;
      box(x + Math.cos(a) * r * .91, base + height / 2, z + Math.sin(a) * r * .91, .16, height * .84, .16, 1);
    }
    drum(x, base + height + 1.4, z, r * .9, 2.2, 0, 0);
  }
  function arch(x: number, base: number, z: number, r: number, height: number) {
    column(x - r, base, z, height); column(x + r, base, z, height);
    for (let j = 0; j <= 22; j++) {
      const a = j / 22 * Math.PI;
      box(x + Math.cos(a) * r, base + height + Math.sin(a) * r, z, 2.4, 3.2, 3.5, 0, a - Math.PI / 2);
    }
    ring(x, base + height, z + 1.9, r, .13, 1, Math.PI);
  }
  function finish() {
    const merged = parts.map(p => mergeGeometries(p)!);
    const geometry = mergeGeometries(merged, true)!;
    parts.flat().forEach(g => g.dispose()); merged.forEach(g => g.dispose());
    geometry.computeBoundingSphere();
    const vertices = geometry.attributes.position.array as Float32Array;
    const indices = Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i);
    return { geometry, vertices, indices };
  }
  return { add, box, drum, ring, column, arch, finish };
}

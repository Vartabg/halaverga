import { BufferGeometry, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Cambered, asymmetric vanes. Each feather has a raised rachis, rounded shoulder and tapered tip. */
function feather(side: number, root: number[], tip: number[], width: number, depth: number, shade: number) {
  const vertices: number[] = [], colors: number[] = [], uv: number[] = [], indices: number[] = [];
  const dx = tip[0] - root[0], dy = tip[1] - root[1], length = Math.hypot(dx, dy), nx = -dy / length, ny = dx / length;
  const rows = 12, cols = 6;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = j / rows, v = i / cols * 2 - 1;
    const profile = Math.min(1, u / .12) * Math.pow(Math.max(.00001, Math.min(1, (1 - u) / .40)), .38);
    const vane = v * width * profile * (v < 0 ? .62 : 1), bend = Math.sin(u * Math.PI) * length * .075;
    vertices.push(side * (root[0] + dx * u + nx * (vane + bend)), root[1] + dy * u + ny * (vane + bend),
      depth + Math.sin(u * Math.PI) * .045 - v * v * .018 * profile + Math.pow(1 - Math.abs(v), 8) * .006);
    const tone = shade * (.72 + .28 * u) * (1 - .11 * Math.abs(v)); colors.push(tone, tone * .99, tone * .94);
    uv.push(i / cols, u);
    if (j < rows && i < cols) {
      const a = j * (cols + 1) + i, b = a + cols + 1;
      if (side > 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
      else indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}
/** Flight feathers sit behind three overlapping covert rows; their roots are concealed and the tips remain separated. */
export function featherWing(side: number, outer: boolean) {
  const parts: BufferGeometry[] = [];
  const add = (root: number[], tip: number[], width: number, depth: number, shade: number) => parts.push(feather(side, root, tip, width, depth, shade));
  if (outer) {
    for (let j = 0; j < 10; j++) {
      const u = j / 9;
      add([.10 + u * .40, .17 - u * .17], [1.48 - u * .68, .02 - u * 1.22], .10, .016 - u * .004, .92 + .06 * u);
    }
    for (let row = 0; row < 3; row++) for (let j = 0; j < 12; j++) {
      const u = j / 11, d = .30 + row * .11;
      add([u * .58, .24 - u * .19 - row * .055], [.24 + u * .66, .15 - u * .37 - d], .095, .06 + row * .012, .84 + row * .045);
    }
  } else {
    for (let j = 0; j < 14; j++) {
      const u = j / 13;
      add([.04 + u * .70, .07 + Math.sin(u * Math.PI) * .21], [.13 + u * .87, -.47 - u * .19], .10, .014, .88 + .08 * u);
    }
    for (let row = 0; row < 3; row++) for (let j = 0; j < 13; j++) {
      const u = j / 12;
      add([u * .73, .10 + Math.sin(u * Math.PI) * .18 - row * .06], [.06 + u * .82, -.13 - row * .105], .090, .06 + row * .012, .86 + row * .04);
    }
  }
  const out = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); return out;
}

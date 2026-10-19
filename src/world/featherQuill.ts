import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
/** A thin asymmetric vane in the wing's XZ flight plane. Bone ownership is the feather's actual attachment. */
export function featherQuill(side: number, root: Vector3, tip: Vector3, width: number, bone: number, dorsal: boolean, shade: number, rows = 6, cols = 4) {
  const p: number[] = [], color: number[] = [], uv: number[] = [], joints: number[] = [], weight: number[] = [], indices: number[] = [];
  const dx = tip.x - root.x, dz = tip.z - root.z, length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length, normal = dorsal ? 1 : -1;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = j / rows, v = i / cols * 2 - 1;
    const profile = Math.min(1, u / .13) * Math.sqrt(Math.max(.002, Math.min(1, (1 - u) / .27)));
    const vane = v * width * profile * (v < 0 ? .55 : 1), bend = Math.sin(u * Math.PI) * length * .025;
    const split = v > .8 ? Math.sin(u * 83 + root.x * 17) * .0015 * u : 0;
    p.push(side * (root.x + dx * u + nx * (vane + bend)), root.y + (tip.y - root.y) * u
      + normal * (.012 * (1 - v * v) * profile + .0025 * Math.pow(1 - Math.abs(v), 8)), root.z + dz * u + nz * (vane + bend + split));
    const tone = shade * (.75 + .25 * Math.min(1, u / .65)) * (1 - Math.abs(v) * .045) * (dorsal ? 1 : .90); color.push(tone, tone * .995, tone * .965);
    uv.push(i / cols, u); joints.push(bone, 0, 0, 0); weight.push(1, 0, 0, 0);
    if (j < rows && i < cols) {
      const a = j * (cols + 1) + i, b = a + cols + 1;
      if ((side > 0) === dorsal) indices.push(a, a + 1, b, a + 1, b + 1, b);
      else indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(p, 3)); g.setAttribute('color', new Float32BufferAttribute(color, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setAttribute('skinIndex', new Float32BufferAttribute(joints, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(weight, 4)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

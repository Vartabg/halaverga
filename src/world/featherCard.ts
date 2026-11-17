import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { RACHIS, atlasU } from './featherAtlas';
/**
 * One feather as a curved, cambered card in the wing's XZ flight plane, textured from the feather atlas (its outline comes from
 * the atlas alpha). The narrow outer vane lies on the -n side, as on a real remex. Bone ownership is the feather's attachment.
 * Attributes: colour (layer shade and the darker covered root), aThin (how much light passes through: thin tips glow when
 * backlit), and atlas uv.
 */
export function featherCard(side: number, root: Vector3, tip: Vector3, width: number, bone: number, dorsal: boolean, shade: number,
  kind: number, rows = 8, cols = 4) {
  const p: number[] = [], color: number[] = [], uv: number[] = [], thin: number[] = [], joints: number[] = [], weight: number[] = [], indices: number[] = [];
  const dx = tip.x - root.x, dz = tip.z - root.z, length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length, up = dorsal ? 1 : -1;
  const r0 = RACHIS[kind], full = width * (kind <= 2 ? 2.15 : 2), flight = kind <= 2;
  const jitter = Math.sin(root.x * 91.7 + root.z * 37.3 + bone) * .5 + .5;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = j / rows, s = i / cols, across = (s - r0) / (s < r0 ? r0 : 1 - r0);
    const off = (s - r0) * full, bend = Math.sin(u * Math.PI) * length * (flight ? .03 : .015);
    // The vane arches over the rachis (convex above), most at mid-length; the tip of a flight feather curls slightly down.
    const camber = (flight ? .016 : .01) * (1 - across * across) * Math.sin(Math.min(1, u * 1.15) * Math.PI * .9);
    const curl = flight ? -.04 * length * Math.pow(u, 3) : 0;
    p.push(side * (root.x + dx * u + nx * (off + bend)), root.y + (tip.y - root.y) * u + up * (camber + .004 * (1 - Math.abs(across))) + curl * up * .4,
      root.z + dz * u + nz * (off + bend));
    // Each row shades the feathers it overlaps: the covered root is darkest, the exposed tip full bright.
    const cover = flight ? .66 + .34 * Math.min(1, u / .5) : .58 + .42 * Math.min(1, u / .55);
    const tone = shade * cover * cover * (2 - cover) * (dorsal ? 1 : .84) * (.96 + .08 * jitter);
    color.push(tone, tone * .992, tone * .972);
    uv.push(atlasU(kind, s), u); thin.push(flight ? .5 + .5 * u : .3 + .2 * u);
    joints.push(bone, 0, 0, 0); weight.push(1, 0, 0, 0);
    if (j < rows && i < cols) {
      const a = j * (cols + 1) + i, b = a + cols + 1;
      if ((side > 0) === dorsal) indices.push(a, a + 1, b, a + 1, b + 1, b);
      else indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(p, 3)); g.setAttribute('color', new Float32BufferAttribute(color, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setAttribute('aThin', new Float32BufferAttribute(thin, 1));
  g.setAttribute('skinIndex', new Float32BufferAttribute(joints, 4)); g.setAttribute('skinWeight', new Float32BufferAttribute(weight, 4));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}

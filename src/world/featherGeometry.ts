import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A curved, pointed feather with a raised quill, rather than a rectangular wing slat. */
function feather(length: number, width: number, side: number, x: number, y: number, angle: number) {
  const shape = new Shape(); shape.moveTo(0, 0);
  shape.bezierCurveTo(length * .22, width * .65, length * .72, width * .42, length, -width * .2);
  shape.bezierCurveTo(length * .65, -width * .5, length * .18, -width * .55, 0, 0);
  const g = new ExtrudeGeometry(shape, { depth: .014, bevelEnabled: false, curveSegments: 5, steps: 1 });
  const positions = g.attributes.position, colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const shade = .72 + .28 * Math.max(0, positions.getX(i) / length);
    colors.set([shade, shade, shade], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.rotateZ(angle); g.translate(x, y, 0); g.scale(side, 1, 1); return g;
}
export function featherWing(side: number, outer: boolean) {
  const parts: BufferGeometry[] = [];
  const count = outer ? 13 : 12;
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    parts.push(outer ? feather(1.32 - u * .47, .18 - u * .045, side, u * .27, .17 - u * .51, .23 - u * .92)
      : feather(.58 + u * .29, .16, side, u * .57, .17 - u * .26, .39 - u * .65));
  }
  const g = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); g.computeVertexNormals(); return g;
}

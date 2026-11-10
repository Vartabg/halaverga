import { BufferGeometry, Float32BufferAttribute } from 'three';
/** A sword stroke as a flat crescent: an arc of radius 2 that is widest at its middle and tapers to a point at both ends, the
 * leading edge sharp and the trailing edge soft. Drawn in the XY plane, opening downward, centred on the origin. */
export function slashGeometry(segments = 28, sweep = Math.PI * .92, width = .42) {
  const positions: number[] = [], indices: number[] = [], start = Math.PI / 2 - sweep / 2;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, a = start + sweep * u, taper = Math.sin(Math.PI * u) ** .7, lead = .25 + .75 * u; // thickest past the middle
    const outer = 2, inner = outer - width * taper * lead;
    positions.push(Math.cos(a) * outer, Math.sin(a) * outer - 1.55, 0, Math.cos(a) * inner, Math.sin(a) * inner - 1.55, 0);
    if (i < segments) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3)); g.setIndex(indices);
  return g;
}

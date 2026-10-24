import { BufferGeometry, Float32BufferAttribute } from 'three';
import { smooth } from './wingMotion';
import { FEATHER, RACHIS, atlasU } from './featherAtlas';
/** The bed samples an opaque mid-vane covert texel, so the alpha test never cuts it and it reads as plumage where it shows. */
const SOLID = [atlasU(FEATHER.covert, RACHIS[FEATHER.covert] * .55), .55] as const;
/** A continuous, cambered feather bed closes the elbow/wrist seams beneath the overlapping plumage. */
export function wingAirfoil(side: number) {
  const p: number[] = [], uv: number[] = [], thin: number[] = [], c: number[] = [], joints: number[] = [], weights: number[] = [], indices: number[] = [];
  const rows = 22, cols = 16;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const x = j / rows * 1.44, a = i / cols * Math.PI * 2, v = .5 + .5 * Math.cos(a);
    const lead = x < .48 ? x / .48 * .16 - .045 : .16 - smooth(.48, 1.04, x) * .21;
    const chord = (.15 + .045 * Math.sin(x / 1.44 * Math.PI)) * (1 - .25 * smooth(1.06, 1.44, x));
    const thickness = .050 * (1 - .78 * smooth(0, 1.44, x));
    p.push(side * x, Math.sin(v * Math.PI) * .018 + Math.sin(a) * thickness, lead + v * chord);
    uv.push(SOLID[0], SOLID[1]); thin.push(.15); const tone = Math.sin(a) > 0 ? .9 : .82; c.push(tone, tone * .992, tone * .972);
    const fore = smooth(.35, .63, x), hand = smooth(.95, 1.25, x), trailing = smooth(.05, .36, v), shares: Record<number, number> = {};
    const add = (bone: number, w: number) => { shares[bone] = (shares[bone] ?? 0) + w; };
    add(0, (1 - fore) * trailing); add(15, fore * (1 - hand) * trailing); add(16, fore * hand * trailing);
    add(x < .48 ? 0 : x < 1.02 ? 1 : 3, 1 - trailing);
    const ranked = Object.entries(shares).sort((a, b) => b[1] - a[1]).slice(0, 4);
    while (ranked.length < 4) ranked.push(['0', 0]);
    const total = ranked.reduce((s, a) => s + a[1], 0);
    for (const [bone, weight] of ranked) { joints.push(Number(bone)); weights.push(weight / total); }
    if (j < rows && i < cols) {
      const k = j * (cols + 1) + i, b = k + cols + 1;
      if (side > 0) indices.push(k, b, k + 1, k + 1, b, b + 1); else indices.push(k, k + 1, b, k + 1, b + 1, b);
    }
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(p, 3)); g.setAttribute('color', new Float32BufferAttribute(c, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setAttribute('aThin', new Float32BufferAttribute(thin, 1)); g.setAttribute('skinIndex', new Float32BufferAttribute(joints, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

import { BufferGeometry, Float32BufferAttribute } from 'three';

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };

/** Irregular seven-sided, broad-faceted worked stone. Few horizontal rings: no brick-course or chimney read. */
export function megalithGeometry(height: number, top: number, bottom: number, seed: number) {
  const sides = 7, levels = Math.max(3, Math.min(7, Math.round(height / 9))), ring = sides + 1;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= levels; i++) {
    const t = i / levels, radius = bottom + (top - bottom) * t;
    for (let j = 0; j <= sides; j++) {
      const side = j % sides, a = side / sides * Math.PI * 2 + seed * .071 + (i % 2 ? .018 : -.018);
      const chip = .88 + hash(seed * 19 + side * 7) * .24 + Math.sin(i * 1.3 + side) * .035;
      const drift = Math.sin(t * Math.PI) * bottom * .07;
      const x = Math.cos(a) * radius * chip + Math.sin(seed) * drift;
      const z = Math.sin(a) * radius * chip + Math.cos(seed * .7) * drift;
      const crown = i === levels ? (hash(seed + side * 13) - .5) * Math.min(1.1, height * .045) : 0;
      positions.push(x, -height / 2 + height * t + crown, z); uvs.push(j / sides, t * height / 8);
    }
  }
  for (let i = 0; i < levels; i++) for (let j = 0; j < sides; j++) {
    const a = i * ring + j, b = a + ring;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const bottomCentre = positions.length / 3; positions.push(0, -height / 2, 0); uvs.push(.5, 0);
  const topCentre = positions.length / 3; positions.push(0, height / 2, 0); uvs.push(.5, 1);
  for (let j = 0; j < sides; j++) {
    indices.push(bottomCentre, j, j + 1);
    const a = levels * ring + j; indices.push(topCentre, a + 1, a);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

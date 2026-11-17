import { DataTexture, Float32BufferAttribute, Mesh, MeshStandardMaterial, RepeatWrapping, RGBAFormat, LinearMipmapLinearFilter, Vector2, type Object3D } from 'three';

/** Small original repeating surface maps. Geometry carries the silhouette; these supply hammered metal and woven fibre. */
export function characterSurface(root: Object3D) {
  const size = 128, textures: DataTexture[] = [];
  const map = (pixel: (x: number, y: number) => number[]) => {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set([...pixel(x, y), 255], (y * size + x) * 4);
    const t = new DataTexture(data, size, size, RGBAFormat); t.wrapS = t.wrapT = RepeatWrapping;
    t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.needsUpdate = true; textures.push(t); return t;
  };
  const noise = (x: number, y: number) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  const metal = map((x, y) => [128 + (noise(x, y) - .5) * 28, 128 + (noise(y, x) - .5) * 28, 253]);
  const rough = map((x, y) => { const v = 180 + noise(x, y) * 65; return [v, v, v]; });
  const cloth = map((x, y) => {
    const a = Math.sin(x * Math.PI / 2), b = Math.sin(y * Math.PI / 2);
    return [128 + a * (18 + b * 8), 128 + b * (18 - a * 8), 251];
  });
  root.traverse(o => {
    if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return;
    const m = o.material, isMetal = ['Chased bronze', 'Burnished gold'].includes(m.name), isCloth = ['Ivory linen', 'Crimson silk'].includes(m.name);
    if (!isMetal && !isCloth) return;
    const p = o.geometry.attributes.position, uv = new Float32Array(p.count * 2), density = isCloth ? 16 : 9;
    for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i) * .43) * density; uv[i * 2 + 1] = p.getY(i) * density; }
    o.geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    m.normalMap = isMetal ? metal : cloth; m.normalScale = new Vector2(isMetal ? .24 : .36, isMetal ? .24 : .36);
    if (isMetal) { m.roughnessMap = rough; m.roughness = .5; }
    m.needsUpdate = true;
  });
  return () => textures.forEach(t => t.dispose());
}

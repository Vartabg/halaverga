import { BufferGeometry, BoxGeometry, Matrix4, Float32BufferAttribute } from 'three';

/** Constructs the 6-wing seraphic dark plumage for Semjaza. */
export function buildSemjazaWings(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // 3 Wing pairs (Upper, Mid, Lower)
  const wingConfigs = [
    { ry: 0.25, rz: 0.45, y: 4.2, scale: 1.2 }, // Upper wings (spread wide)
    { ry: 0.15, rz: 0.10, y: 3.4, scale: 1.0 }, // Mid wings
    { ry: 0.05, rz: -0.35, y: 2.6, scale: 0.8 }, // Lower trailing wings
  ];

  for (const cfg of wingConfigs) {
    // Left Wing (layered feather blades)
    for (let f = 0; f < 5; f++) {
      const blade = new BoxGeometry(1.6 - f * 0.2, 0.25, 0.04);
      const m = new Matrix4()
        .makeRotationZ(cfg.rz + f * 0.08)
        .multiply(new Matrix4().makeRotationY(cfg.ry))
        .setPosition(-(1.2 + f * 0.4) * cfg.scale, cfg.y + (f * 0.15), -0.4 - f * 0.05);
      blade.applyMatrix4(m);
      parts.push(blade);
    }

    // Right Wing (mirrored)
    for (let f = 0; f < 5; f++) {
      const blade = new BoxGeometry(1.6 - f * 0.2, 0.25, 0.04);
      const m = new Matrix4()
        .makeRotationZ(-(cfg.rz + f * 0.08))
        .multiply(new Matrix4().makeRotationY(-cfg.ry))
        .setPosition((1.2 + f * 0.4) * cfg.scale, cfg.y + (f * 0.15), -0.4 - f * 0.05);
      blade.applyMatrix4(m);
      parts.push(blade);
    }
  }

  let totalVerts = 0;
  for (const g of parts) totalVerts += g.attributes.position.count;
  const pos = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of parts) {
    const p = g.attributes.position.array as Float32Array;
    pos.set(p, offset);
    offset += p.length;
    g.dispose();
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new Float32BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  return merged;
}

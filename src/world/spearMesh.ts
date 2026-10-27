import { BufferGeometry, CylinderGeometry, ConeGeometry, Matrix4, Float32BufferAttribute } from 'three';

/** Procedural geometry for the Spear of Dawn (Holy Glaive of the Covenant). */
export function buildSpearMesh(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Spear Shaft (Length 2.8m, slim electrum rod)
  const shaft = new CylinderGeometry(0.024, 0.028, 2.8, 6);
  shaft.applyMatrix4(new Matrix4().makeTranslation(0, 1.4, 0));
  parts.push(shaft);

  // Spear Blade (Radiant leaf-shaped blade, 0.7m)
  const blade = new ConeGeometry(0.08, 0.7, 4);
  blade.applyMatrix4(new Matrix4().makeScale(1, 1, 0.25).setPosition(0, 3.15, 0));
  parts.push(blade);

  // Counterweight / Pommel
  const pommel = new ConeGeometry(0.06, 0.25, 4);
  pommel.applyMatrix4(new Matrix4().makeRotationZ(Math.PI).setPosition(0, -0.12, 0));
  parts.push(pommel);

  // Covenant Crossbar Rings
  const ring = new CylinderGeometry(0.055, 0.055, 0.04, 6);
  ring.applyMatrix4(new Matrix4().makeTranslation(0, 2.78, 0));
  parts.push(ring);

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

/** Trailing attack arc sweep ribbon geometry. */
export function buildAttackArc(): BufferGeometry {
  const segs = 16;
  const pos = new Float32Array(segs * 2 * 3);
  const rInner = 1.4, rOuter = 2.4;
  for (let i = 0; i < segs; i++) {
    const a = (i / (segs - 1)) * (Math.PI * 0.75) - Math.PI * 0.375;
    const cos = Math.cos(a), sin = Math.sin(a);
    // Inner vertex
    pos[i * 6 + 0] = sin * rInner;
    pos[i * 6 + 1] = 0;
    pos[i * 6 + 2] = cos * rInner;
    // Outer vertex
    pos[i * 6 + 3] = sin * rOuter;
    pos[i * 6 + 1 + 3] = 0;
    pos[i * 6 + 2 + 3] = cos * rOuter;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

import { BufferGeometry, CylinderGeometry, BoxGeometry, ConeGeometry, Matrix4, Float32BufferAttribute } from 'three';

/** Constructs the stylized, faceted geometry for Semjaza (Chief of the Watchers). */
export function buildSemjazaBody(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Torso / Obsidian Breastplate (Scale ~2.5x player)
  const torso = new BoxGeometry(1.4, 2.2, 0.9);
  torso.applyMatrix4(new Matrix4().makeTranslation(0, 3.2, 0));
  parts.push(torso);

  // Tapered lower robe / skirt
  const robe = new CylinderGeometry(0.7, 1.3, 2.4, 6);
  robe.applyMatrix4(new Matrix4().makeTranslation(0, 1.2, 0));
  parts.push(robe);

  // Pauldrons (faceted shoulder megaliths)
  const leftPauldron = new BoxGeometry(0.8, 0.6, 1.1);
  leftPauldron.applyMatrix4(new Matrix4().makeRotationZ(0.3).setPosition(-1.1, 4.2, 0));
  parts.push(leftPauldron);

  const rightPauldron = new BoxGeometry(0.8, 0.6, 1.1);
  rightPauldron.applyMatrix4(new Matrix4().makeRotationZ(-0.3).setPosition(1.1, 4.2, 0));
  parts.push(rightPauldron);

  // Head and Obsidian Crown
  const head = new BoxGeometry(0.65, 0.8, 0.7);
  head.applyMatrix4(new Matrix4().makeTranslation(0, 4.8, 0.1));
  parts.push(head);

  const crownHornL = new ConeGeometry(0.18, 0.9, 4);
  crownHornL.applyMatrix4(new Matrix4().makeRotationZ(0.4).setPosition(-0.35, 5.4, 0.1));
  parts.push(crownHornL);

  const crownHornR = new ConeGeometry(0.18, 0.9, 4);
  crownHornR.applyMatrix4(new Matrix4().makeRotationZ(-0.4).setPosition(0.35, 5.4, 0.1));
  parts.push(crownHornR);

  // Left Arm (holding staff)
  const armL = new CylinderGeometry(0.22, 0.28, 2.0, 5);
  armL.applyMatrix4(new Matrix4().makeRotationZ(-0.3).setPosition(-1.2, 2.8, 0.3));
  parts.push(armL);

  // Right Arm (spellcasting)
  const armR = new CylinderGeometry(0.22, 0.28, 2.0, 5);
  armR.applyMatrix4(new Matrix4().makeRotationZ(0.4).setPosition(1.2, 2.8, -0.2));
  parts.push(armR);

  return mergeGeometries(parts);
}

/** The Colossal Staff of Forbidden Lightning. */
export function buildSemjazaStaff(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // Staff Shaft
  const shaft = new CylinderGeometry(0.08, 0.12, 5.6, 6);
  shaft.applyMatrix4(new Matrix4().makeTranslation(0, 2.8, 0));
  parts.push(shaft);

  // Staff Head (Covenant Rune Prism)
  const headPrism = new BoxGeometry(0.5, 0.9, 0.5);
  headPrism.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 4).setPosition(0, 5.6, 0));
  parts.push(headPrism);

  const topSpike = new ConeGeometry(0.25, 0.8, 4);
  topSpike.applyMatrix4(new Matrix4().makeTranslation(0, 6.3, 0));
  parts.push(topSpike);

  return mergeGeometries(parts);
}

function mergeGeometries(geos: BufferGeometry[]): BufferGeometry {
  let totalVerts = 0;
  for (const g of geos) totalVerts += g.attributes.position.count;
  const pos = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of geos) {
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

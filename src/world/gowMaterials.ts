import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  TorusGeometry,
  type Object3D,
} from 'three';

export interface GowRigHandle {
  swordTip: Object3D;
  backAnchor: Group;
  flashMaterials: MeshStandardMaterial[];
  dispose: () => void;
}

function attachWarArmor(
  root: Object3D,
  primaryMat: MeshStandardMaterial,
  secondaryMat: MeshStandardMaterial,
  disposables: Array<{ dispose: () => void }>,
) {
  const spine3 = root.getObjectByName('spine_03') ?? root;
  const spine1 = root.getObjectByName('spine_01') ?? spine3;

  // Gorget collar & Shoulder Pauldrons on spine_03 (leaves sculpted muscular chest visible)
  const collarGeo = new TorusGeometry(0.125, 0.024, 8, 16);
  const collar = new Mesh(collarGeo, primaryMat);
  collar.rotation.x = Math.PI * 0.5;
  collar.position.set(0, 0.17, 0.01);

  const pauldronGeo = new OctahedronGeometry(0.105, 1);
  const leftPauldron = new Mesh(pauldronGeo, primaryMat);
  leftPauldron.position.set(0.22, 0.16, 0);
  leftPauldron.scale.set(1.2, 0.72, 1.05);
  const rightPauldron = new Mesh(pauldronGeo, primaryMat);
  rightPauldron.position.set(-0.22, 0.16, 0);
  rightPauldron.scale.set(1.2, 0.72, 1.05);
  spine3.add(collar, leftPauldron, rightPauldron);
  disposables.push(collarGeo, pauldronGeo);

  // War Girdle on spine_01 + Thigh Cuisses + Shin Greaves
  const girdleGeo = new CylinderGeometry(0.185, 0.225, 0.26, 12);
  const girdle = new Mesh(girdleGeo, secondaryMat);
  girdle.position.set(0, -0.05, 0);
  spine1.add(girdle);

  const thighGeo = new CylinderGeometry(0.118, 0.095, 0.3, 10);
  const greaveGeo = new CylinderGeometry(0.072, 0.054, 0.34, 10);
  disposables.push(girdleGeo, thighGeo, greaveGeo);

  for (const side of ['l', 'r'] as const) {
    const thigh = root.getObjectByName(`thigh_${side}`);
    if (thigh) {
      const cuisse = new Mesh(thighGeo, secondaryMat);
      cuisse.position.set(0, 0.13, 0);
      thigh.add(cuisse);
    }
    const calf = root.getObjectByName(`calf_${side}`);
    if (calf) {
      const greave = new Mesh(greaveGeo, primaryMat);
      greave.position.set(0, 0.22, 0);
      calf.add(greave);
    }
  }
}

export function decorateArchangelHero(root: Object3D): GowRigHandle {
  const disposables: Array<{ dispose: () => void }> = [];
  const goldMat = new MeshStandardMaterial({ color: '#e5b95c', metalness: 0.78, roughness: 0.24, emissive: '#4d3208', emissiveIntensity: 0.25 });
  const kiltMat = new MeshStandardMaterial({ color: '#2b2118', metalness: 0.38, roughness: 0.52, emissive: '#1c140c', emissiveIntensity: 0.12 });
  const bladeMat = new MeshStandardMaterial({ color: '#fff8e8', metalness: 0.85, roughness: 0.16, emissive: '#f5b841', emissiveIntensity: 0.65 });
  disposables.push(goldMat, kiltMat, bladeMat);

  root.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  const spine = root.getObjectByName('spine_03') ?? root;
  const backAnchor = new Group();
  backAnchor.position.set(0, 0.12, -0.15);
  spine.add(backAnchor);

  attachWarArmor(root, goldMat, kiltMat, disposables);

  const bracerGeo = new CylinderGeometry(0.058, 0.05, 0.19, 10);
  const shieldGeo = new CylinderGeometry(0.16, 0.16, 0.024, 16);
  disposables.push(bracerGeo, shieldGeo);
  const armL = root.getObjectByName('lowerarm_l');
  if (armL) {
    const bracerL = new Mesh(bracerGeo, goldMat);
    bracerL.position.set(0, 0.11, 0);
    const aegisDisk = new Mesh(shieldGeo, goldMat);
    aegisDisk.rotation.z = Math.PI * 0.5;
    aegisDisk.position.set(0.06, 0.12, 0);
    armL.add(bracerL, aegisDisk);
  }
  const armR = root.getObjectByName('lowerarm_r');
  if (armR) {
    const bracerR = new Mesh(bracerGeo, goldMat);
    bracerR.position.set(0, 0.11, 0);
    armR.add(bracerR);
  }

  const handR = root.getObjectByName('hand_r') ?? spine;
  const swordGroup = new Group();
  swordGroup.position.set(0, 0.08, 0.03);
  swordGroup.rotation.x = Math.PI * 0.5;
  const hiltGeo = new CylinderGeometry(0.02, 0.024, 0.26, 8);
  const guardGeo = new BoxGeometry(0.28, 0.045, 0.065);
  const bladeGeo = new ConeGeometry(0.062, 1.18, 4);
  disposables.push(hiltGeo, guardGeo, bladeGeo);

  const hilt = new Mesh(hiltGeo, goldMat);
  const guard = new Mesh(guardGeo, goldMat);
  guard.position.set(0, 0.13, 0);
  const blade = new Mesh(bladeGeo, bladeMat);
  blade.position.set(0, 0.72, 0);
  blade.scale.set(1, 1, 0.28);
  const swordTip = new Group();
  swordTip.position.set(0, 1.28, 0);
  swordGroup.add(hilt, guard, blade, swordTip);
  handR.add(swordGroup);

  return { swordTip, backAnchor, flashMaterials: [goldMat, bladeMat], dispose() { for (const d of disposables) d.dispose(); } };
}

export function decorateWatcherEnemy(root: Object3D, isBoss: boolean): GowRigHandle {
  const disposables: Array<{ dispose: () => void }> = [];
  const armorMat = new MeshStandardMaterial({ color: isBoss ? '#2a1824' : '#1f2833', metalness: 0.78, roughness: 0.26, emissive: isBoss ? '#4a1228' : '#162234', emissiveIntensity: 0.35 });
  const edgeMat = new MeshStandardMaterial({ color: isBoss ? '#ff6a3d' : '#d98a3c', metalness: 0.84, roughness: 0.2, emissive: isBoss ? '#ff3b1f' : '#b85d18', emissiveIntensity: 0.72 });
  disposables.push(armorMat, edgeMat);

  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (mesh.material && 'clone' in mesh.material) {
      const clonedMat = (mesh.material as MeshStandardMaterial).clone();
      const isHair = mesh.name.toLowerCase().includes('hair');
      clonedMat.color.set(isHair ? '#1c1824' : isBoss ? '#7a6268' : '#8a7970');
      mesh.material = clonedMat;
      disposables.push(clonedMat);
    }
  });

  const spine = root.getObjectByName('spine_03') ?? root;
  const backAnchor = new Group();
  backAnchor.position.set(0, 0.14, -0.16);
  spine.add(backAnchor);

  attachWarArmor(root, edgeMat, armorMat, disposables);

  const head = root.getObjectByName('Head');
  if (head) {
    const crownGeo = new TorusGeometry(0.115, 0.018, 8, 18);
    const crown = new Mesh(crownGeo, edgeMat);
    crown.rotation.x = Math.PI * 0.5;
    crown.position.set(0, 0.18, 0);
    head.add(crown);
    disposables.push(crownGeo);
  }

  const handR = root.getObjectByName('hand_r') ?? spine;
  const weaponGroup = new Group();
  weaponGroup.position.set(0, 0.08, 0.04);
  weaponGroup.rotation.x = Math.PI * 0.5;
  const shaftGeo = new CylinderGeometry(0.022, 0.026, 0.32, 8);
  const guardGeo = new BoxGeometry(0.26, 0.042, 0.06);
  const cleaverGeo = new ConeGeometry(0.068, isBoss ? 1.24 : 1.02, 4);
  disposables.push(shaftGeo, guardGeo, cleaverGeo);

  const shaft = new Mesh(shaftGeo, armorMat);
  const guard = new Mesh(guardGeo, armorMat);
  guard.position.set(0, 0.15, 0);
  const cleaver = new Mesh(cleaverGeo, edgeMat);
  cleaver.position.set(0, isBoss ? 0.76 : 0.64, 0);
  cleaver.scale.set(1, 1, 0.28);
  const swordTip = new Group();
  swordTip.position.set(0, isBoss ? 1.35 : 1.12, 0);
  weaponGroup.add(shaft, guard, cleaver, swordTip);
  handR.add(weaponGroup);

  return { swordTip, backAnchor, flashMaterials: [armorMat, edgeMat], dispose() { for (const d of disposables) d.dispose(); } };
}

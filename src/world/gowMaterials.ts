import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  type Object3D,
} from 'three';

export interface GowRigHandle {
  swordTip: Object3D;
  backAnchor: Group;
  flashMaterials: MeshStandardMaterial[];
  dispose: () => void;
}

export function decorateArchangelHero(root: Object3D): GowRigHandle {
  const disposables: Array<{ dispose: () => void }> = [];
  const goldMat = new MeshStandardMaterial({ color: '#e5b95c', metalness: 0.78, roughness: 0.24, emissive: '#4d3208', emissiveIntensity: 0.25 });
  const bladeMat = new MeshStandardMaterial({ color: '#fff8e8', metalness: 0.85, roughness: 0.16, emissive: '#f5b841', emissiveIntensity: 0.65 });
  disposables.push(goldMat, bladeMat);

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

  const bracerGeo = new CylinderGeometry(0.052, 0.044, 0.17, 10);
  const shieldGeo = new CylinderGeometry(0.15, 0.15, 0.022, 16);
  disposables.push(bracerGeo, shieldGeo);
  const armL = root.getObjectByName('lowerarm_l');
  if (armL) {
    const bracerL = new Mesh(bracerGeo, goldMat);
    bracerL.position.set(0, 0.11, 0);
    const aegisDisk = new Mesh(shieldGeo, goldMat);
    aegisDisk.rotation.z = Math.PI * 0.5;
    aegisDisk.position.set(0.055, 0.12, 0);
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
  const guardGeo = new BoxGeometry(0.26, 0.042, 0.06);
  const bladeGeo = new ConeGeometry(0.058, 1.16, 4);
  disposables.push(hiltGeo, guardGeo, bladeGeo);

  const hilt = new Mesh(hiltGeo, goldMat);
  const guard = new Mesh(guardGeo, goldMat);
  guard.position.set(0, 0.13, 0);
  const blade = new Mesh(bladeGeo, bladeMat);
  blade.position.set(0, 0.71, 0);
  blade.scale.set(1, 1, 0.28);
  const swordTip = new Group();
  swordTip.position.set(0, 1.26, 0);
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

  const bracerGeo = new CylinderGeometry(0.052, 0.044, 0.17, 10);
  disposables.push(bracerGeo);
  for (const side of ['l', 'r'] as const) {
    const arm = root.getObjectByName(`lowerarm_${side}`);
    if (arm) {
      const bracer = new Mesh(bracerGeo, armorMat);
      bracer.position.set(0, 0.11, 0);
      arm.add(bracer);
    }
  }

  const head = root.getObjectByName('Head');
  if (head) {
    const crownGeo = new TorusGeometry(0.108, 0.015, 8, 18);
    const crown = new Mesh(crownGeo, edgeMat);
    crown.rotation.x = Math.PI * 0.5;
    crown.position.set(0, 0.16, 0);
    head.add(crown);
    disposables.push(crownGeo);
  }

  const handR = root.getObjectByName('hand_r') ?? spine;
  const weaponGroup = new Group();
  weaponGroup.position.set(0, 0.08, 0.04);
  weaponGroup.rotation.x = Math.PI * 0.5;
  const shaftGeo = new CylinderGeometry(0.022, 0.026, 0.30, 8);
  const guardGeo = new BoxGeometry(0.24, 0.04, 0.055);
  const cleaverGeo = new ConeGeometry(0.062, isBoss ? 1.22 : 1.0, 4);
  disposables.push(shaftGeo, guardGeo, cleaverGeo);

  const shaft = new Mesh(shaftGeo, armorMat);
  const guard = new Mesh(guardGeo, armorMat);
  guard.position.set(0, 0.14, 0);
  const cleaver = new Mesh(cleaverGeo, edgeMat);
  cleaver.position.set(0, isBoss ? 0.75 : 0.63, 0);
  cleaver.scale.set(1, 1, 0.28);
  const swordTip = new Group();
  swordTip.position.set(0, isBoss ? 1.32 : 1.1, 0);
  weaponGroup.add(shaft, guard, cleaver, swordTip);
  handR.add(weaponGroup);

  return { swordTip, backAnchor, flashMaterials: [armorMat, edgeMat], dispose() { for (const d of disposables) d.dispose(); } };
}

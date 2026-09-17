import { Group, Mesh, SkinnedMesh, type Object3D } from 'three';
import { buildSuitParts, parents, pivots } from './suitGeometry';
import { buildSkinnedSuit } from './skinnedSuit';
export function buildSuitRig(source: Object3D) {
  let skinned = false; source.traverse(object => { if (object instanceof SkinnedMesh) skinned = true; });
  if (skinned) return buildSkinnedSuit(source);
  const assembly = buildSuitParts(source), root = new Group();
  const joints = pivots.map(() => new Group());
  joints.forEach((joint, i) => {
    const parent: number = parents[i], pivot = pivots[i], origin = parent < 0 ? [0, 0, 0] : pivots[parent];
    joint.position.set(pivot[0] - origin[0], pivot[1] - origin[1], pivot[2] - origin[2]);
    (parent < 0 ? root : joints[parent]).add(joint);
    assembly.parts[i].forEach(({ geometry, material }) => { const mesh = new Mesh(geometry, material); mesh.castShadow = true; joint.add(mesh); });
  });
  return { root, joints, dispose: () => {
    assembly.parts.flat().forEach(part => part.geometry.dispose()); assembly.materials.forEach(material => material.dispose());
  } };
}

import { Bone, Group, Skeleton, SkinnedMesh, Sphere, Vector3, type Material } from 'three';
import { AVIAN_JOINTS, featherWing, primaryRoot, primaryTip, secondaryRoot, secondaryTip, covertRoot, covertTip } from './featherGeometry';
/** Three limb hinges, a hand and individually featherable primaries. All share one skin/draw per side. */
export function createAvianWing(side: number, material: Material) {
  const root = new Group(), bones: Bone[] = [], axes: Vector3[] = [], points: Vector3[] = [];
  AVIAN_JOINTS.forEach(p => points.push(new Vector3(p[0] * side, p[1], p[2])));
  for (let i = 0; i < 10; i++) {
    const a = primaryRoot(i), b = primaryTip(i); a.x *= side; b.x *= side;
    points.push(a); axes.push(b.sub(a).normalize());
  }
  points.push(new Vector3(1.02 * side, .035, -.065));
  points.push(new Vector3(.76 * side, .007, .05));
  points.push(points[2].clone());
  for (let i = 0; i < 14; i++) { const a = secondaryRoot(i), b = secondaryTip(i); a.x *= side; b.x *= side; points.push(a); axes.push(b.sub(a).normalize()); }
  for (const top of [true, false]) for (let row = 0; row < (top ? 3 : 2); row++) for (let i = 0; i < 15; i++) {
    const a = covertRoot(i, row, top), b = covertTip(i, row, top); a.x *= side; b.x *= side; points.push(a); axes.push(b.sub(a).normalize());
  }
  points.forEach((point, i) => {
    const parent = i === 0 ? -1 : i < 4 ? i - 1 : i === 14 || i === 16 ? 2 : i === 15 || i >= 17 ? 1 : 3;
    const bone = new Bone(); bone.name = `wing_${side < 0 ? 'l' : 'r'}_${i}`;
    bone.position.copy(point).sub(parent < 0 ? new Vector3() : points[parent]); bones.push(bone);
    (parent < 0 ? root : bones[parent]).add(bone);
  });
  const geometry = featherWing(side), mesh = new SkinnedMesh(geometry, material), skeleton = new Skeleton(bones);
  root.add(mesh); root.updateMatrixWorld(true); mesh.bind(skeleton); mesh.castShadow = mesh.receiveShadow = true;
  mesh.boundingSphere = new Sphere(new Vector3(0, 0, 0), 3.3);
  const rest = bones.map(b => b.position.clone());
  return { root, bones, axes, rest, mesh, dispose() { geometry.dispose(); skeleton.dispose(); } };
}
export type AvianWing = ReturnType<typeof createAvianWing>;

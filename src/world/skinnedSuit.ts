import { Bone, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Sphere, Vector3, type Object3D } from 'three';
import { BONE_HEADS, BONE_NAMES, BONE_PARENTS, boneIndex } from './suitSkeleton';

/** Authored bind heads keep a new body's joints inside its actual anatomy. */
function authoredHeads(source: Object3D) {
  const heads = BONE_HEADS.map(p => new Vector3(...p)), found = new Set<number>();
  source.updateMatrixWorld(true);
  source.traverse(object => {
    if (!(object instanceof SkinnedMesh)) return;
    object.skeleton.bones.forEach(bone => {
      const index = boneIndex(bone.name), point = bone.getWorldPosition(new Vector3());
      if (!point.toArray().every(Number.isFinite)) throw new Error('Human suit has invalid bind positions.');
      if (found.has(index) && heads[index].distanceTo(point) > .00001) throw new Error('Human suit has inconsistent bind positions.');
      heads[index].copy(point); found.add(index);
    });
  });
  return heads;
}

/** Bake the authored rest transform, then bind skin weights to neutral game axes. */
export function buildSkinnedSuit(source: Object3D) {
  const heads = authoredHeads(source);
  const root = new Group(), joints = BONE_HEADS.map(() => new Bone());
  joints.forEach((joint, i) => {
    const parent = BONE_PARENTS[i], p = heads[i], origin = parent < 0 ? new Vector3() : heads[parent];
    joint.name = BONE_NAMES[i];
    joint.position.copy(p).sub(origin);
    (parent < 0 ? root : joints[parent]).add(joint);
  });
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(joints), meshes: SkinnedMesh[] = [];
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const dispose = () => {
    meshes.forEach(mesh => mesh.geometry.dispose());
    materials.forEach(material => material.dispose()); skeleton.dispose();
  };
  source.updateMatrixWorld(true);
  try {
    source.traverse(object => {
      if (!(object instanceof SkinnedMesh)) return;
      if (!(object.material instanceof MeshStandardMaterial)) throw new Error('Human suit has unsupported materials.');
      const indices = object.geometry.getAttribute('skinIndex'), weights = object.geometry.getAttribute('skinWeight');
      if (!indices || !weights) throw new Error('Human suit is missing joint weights.');
      const mapping = object.skeleton.bones.map(bone => boneIndex(bone.name));
      if (!materials.has(object.material)) materials.set(object.material, object.material.clone());
      const geometry = object.geometry.clone();
      const mesh = new SkinnedMesh(geometry, materials.get(object.material)!); meshes.push(mesh);
      geometry.applyMatrix4(object.matrixWorld);
      const remapped = geometry.getAttribute('skinIndex');
      for (let vertex = 0; vertex < indices.count; vertex++) {
        for (let component = 0; component < 4; component++) {
          const mapped = mapping[indices.getComponent(vertex, component)];
          if (mapped === undefined) throw new Error('Human suit has invalid joint indices.');
          remapped.setComponent(vertex, component, mapped);
        }
      }
      mesh.normalizeSkinWeights(); mesh.castShadow = true;
      // Conservative sphere includes extended hands in every supported pose.
      mesh.boundingSphere = new Sphere(new Vector3(), 2.5);
      root.add(mesh); mesh.bind(skeleton);
    });
    if (!meshes.length) throw new Error('Human suit is missing its weighted surface.');
    return { root, joints, dispose };
  } catch (error) { dispose(); throw error; }
}

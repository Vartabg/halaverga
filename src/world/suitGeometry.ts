import { Mesh, MeshStandardMaterial, type Object3D, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const pivots = [[0, 0, 0], [0, .675, 0], [-.245, .55, 0], [.245, .55, 0], [-.10, 0, 0], [.10, 0, 0],
  [-.302, .215, 0], [.302, .215, 0], [-.119, -.51, 0], [.119, -.51, 0]] as const;
/** Joint hierarchy shared by the rigid and skinned assembly paths; keep in lockstep with pivots. */
export const parents = [-1, 0, 0, 0, 0, 0, 2, 3, 4, 5] as const;
type Batch = { geometry: BufferGeometry; material: MeshStandardMaterial };
export function buildSuitParts(scene: Object3D) {
  const buckets = pivots.map(() => new Map<MeshStandardMaterial, BufferGeometry[]>());
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const parts: Batch[][] = pivots.map(() => []);
  scene.updateMatrixWorld(true);
  try {
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const rig: unknown = object.userData.suitPart;
      if (typeof rig !== 'number' || !Number.isInteger(rig) || rig < 0 || rig >= pivots.length || !(object.material instanceof MeshStandardMaterial)) {
        throw new Error('Suit asset has invalid articulation or material data.');
      }
      if (!materials.has(object.material)) materials.set(object.material, object.material.clone());
      const material = materials.get(object.material)!;
      const source = object.geometry;
      const geometry = source.index ? source.toNonIndexed() : source.clone();
      geometry.applyMatrix4(object.matrixWorld);
      const p = pivots[rig]; geometry.translate(-p[0], -p[1], -p[2]);
      // One consistent attribute layout per batch; texture coordinates survive when the asset carries them.
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
      }
      const pieces = buckets[rig].get(material) || [];
      pieces.push(geometry); buckets[rig].set(material, pieces);
    });
    buckets.forEach((bucket, i) => {
      if (!bucket.size) throw new Error('Suit asset is missing an articulated body part.');
      bucket.forEach((pieces, material) => {
        // Merging needs identical layouts; a batch that mixes textured and untextured pieces falls back to untextured.
        if (pieces.some(g => !g.attributes.uv)) pieces.forEach(g => g.deleteAttribute('uv'));
        const geometry = mergeGeometries(pieces);
        if (!geometry) throw new Error('Suit surfaces could not be assembled.');
        parts[i].push({ geometry, material });
      });
    });
    return { parts, materials: [...materials.values()] };
  } catch (error) {
    parts.flat().forEach(p => p.geometry.dispose()); materials.forEach(m => m.dispose());
    throw error;
  } finally {
    buckets.forEach(bucket => bucket.forEach(pieces => pieces.forEach(g => g.dispose())));
  }
}

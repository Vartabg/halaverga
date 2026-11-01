import { Box3, Matrix4, Vector3 } from 'three';
import type { AvianWing } from './avianWing';

/** Three conservative volumes, built from every triangle and its real skin weights.
 * Bounds live at the bones, so probing never skins the 23k rendered triangles per frame. */
export function createWingEnvelope(wing: AvianWing) {
  const geometry = wing.mesh.geometry, pos = geometry.attributes.position, skin = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
  const zones = Array.from({ length: 3 }, () => new Map<number, Box3>()), p = new Vector3(), bind = new Matrix4();
  const index = geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    const centre = Math.abs((pos.getX(index.getX(i)) + pos.getX(index.getX(i + 1)) + pos.getX(index.getX(i + 2))) / 3);
    const zone = zones[centre < .48 ? 0 : centre < 1.10 ? 1 : 2];
    for (let k = 0; k < 3; k++) {
      const vertex = index.getX(i + k);
      for (let j = 0; j < 4; j++) if (weights.getComponent(vertex, j) > 0) {
        const bone = skin.getComponent(vertex, j);
        if (!zone.has(bone)) zone.set(bone, new Box3());
        bind.multiplyMatrices(wing.mesh.skeleton.boneInverses[bone], wing.mesh.bindMatrix);
        p.fromBufferAttribute(pos, vertex).applyMatrix4(bind); zone.get(bone)!.expandByPoint(p);
      }
    }
  }
  const parts = zones.map(zone => [...zone].map(([bone, b]) => ({ bone, corners: Array.from({ length: 8 }, (_, i) =>
    new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)) })));
  const bounds = zones.map(() => new Box3()), matrix = new Matrix4();
  return { bounds, update(inverseFrame: Matrix4, accumulate = false) {
    for (let i = 0; i < parts.length; i++) {
      const b = bounds[i]; if (!accumulate) b.makeEmpty();
      for (const part of parts[i]) {
        matrix.multiplyMatrices(inverseFrame, wing.bones[part.bone].matrixWorld);
        for (const corner of part.corners) b.expandByPoint(p.copy(corner).applyMatrix4(matrix));
      }
    }
    return bounds;
  } };
}

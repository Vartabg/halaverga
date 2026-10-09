import { Mesh, Vector3, type Object3D } from 'three';

/** The old decorative horizon is reachable in the restored open world. Collide its actual structural
 * surfaces and hills; the central district keeps its existing coarse envelopes. No rebar colliders. */
export function districtHorizonColliders(scene: Object3D) {
  const result: { name: string; vertices: Float32Array; indices: Uint32Array }[] = [], point = new Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    if (!(object instanceof Mesh) || !/^horizon_(concrete|chalk|ceramic)$/.test(object.name)) return;
    const p = object.geometry.attributes.position, index = object.geometry.index;
    const vertices = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(object.matrixWorld);
      vertices.set([point.x, point.y, point.z], i * 3);
    }
    const indices = Uint32Array.from({ length: index?.count ?? p.count }, (_, i) => index ? index.getX(i) : i);
    result.push({ name: object.name, vertices, indices });
  });
  return result;
}

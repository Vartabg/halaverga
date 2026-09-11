import { Color, Float32BufferAttribute, Mesh, type Object3D, type BufferGeometry, type MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const pivots = [[0, 0, 0], [0, .6, 0], [-.36, .44, 0], [.36, .44, 0], [-.145, -.2, 0], [.145, -.2, 0]] as const;
export function buildSuitParts(scene: Object3D) {
  const buckets: BufferGeometry[][] = pivots.map(() => []);
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const color = (object.material as MeshStandardMaterial).color || new Color('white');
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv'); geometry.deleteAttribute('tangent');
    const side = object.matrixWorld.elements[12] < 0 ? 0 : 1;
    const bucket = /Helmet|Visor/.test(object.name) ? 1 : /Shoulder|Upper arm|Elbow|Forearm|Hand/.test(object.name) ? 2 + side : /Thigh|Knee|Shin|Boot/.test(object.name) ? 4 + side : 0;
    const p = pivots[bucket]; geometry.translate(-p[0], -p[1], -p[2]);
    buckets[bucket].push(geometry.index ? geometry.toNonIndexed() : geometry.clone()); geometry.dispose();
  });
  return buckets.map(pieces => { const merged = mergeGeometries(pieces); pieces.forEach(g => g.dispose()); return merged; });
}

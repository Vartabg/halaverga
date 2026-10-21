import { useEffect, useMemo } from 'react';
import { BufferAttribute, Color, ConeGeometry, CylinderGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Euler, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEDAR, CEDAR_TIERS, makeCedars } from './cedarData';

const HEIGHT = 9; // metres at scale 1, before the per-tree scale

/** One cedar as merged, vertex-coloured geometry: brown trunk, dark dawn-green tiers, snow on the top tier. */
function cedarGeometry() {
  const parts: { g: ConeGeometry | CylinderGeometry; color: Color }[] = [];
  const trunk = new CylinderGeometry(CEDAR.trunkR, CEDAR.trunkR * 1.5, CEDAR.trunkH * HEIGHT, 6);
  trunk.translate(0, CEDAR.trunkH * HEIGHT / 2, 0);
  parts.push({ g: trunk, color: new Color('#4a3524') });
  for (const [i, tier] of CEDAR_TIERS.entries()) {
    const cone = new ConeGeometry(tier.r * 2, tier.h * HEIGHT, 8);
    cone.translate(0, tier.y * HEIGHT, 0);
    parts.push({ g: cone, color: new Color(i % 2 ? '#33502e' : '#2a4527') });
  }
  const snow = new ConeGeometry(CEDAR.snowR * 2, .16 * HEIGHT, 8);
  snow.translate(0, CEDAR.snowY * HEIGHT, 0);
  parts.push({ g: snow, color: new Color('#eef0ea') });
  const geos = parts.map(({ g, color }) => {
    const n = g.attributes.position.count, colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    return g.toNonIndexed();
  });
  return mergeGeometries(geos)!;
}

/** Living cedars on the banks: one instanced draw, no colliders (flight passes over the banks, trees sit outside the corridor). */
export default function Cedars() {
  const mesh = useMemo(() => {
    const cedars = makeCedars();
    const m = new InstancedMesh(cedarGeometry(), new MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: 0 }), cedars.length);
    const matrix = new Matrix4(), q = new Quaternion(), e = new Euler();
    cedars.forEach((c, i) => {
      matrix.compose(new Vector3(...c.position), q.setFromEuler(e.set(0, c.yaw, 0)), new Vector3(c.scale, c.scale, c.scale));
      m.setMatrixAt(i, matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }, []);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); mesh.dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}

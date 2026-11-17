import { useEffect, useMemo } from 'react';
import { BufferAttribute, type BufferGeometry, Color, CylinderGeometry, IcosahedronGeometry, InstancedMesh,
  Matrix4, MeshStandardMaterial, Quaternion, Euler, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEDAR, CEDAR_HEIGHT, CEDAR_TIERS, makeCedars } from './cedarData';

const needles = new Color('#536048'), inner = new Color('#333d30'), frost = new Color('#d5dbd7');
function bough(rx: number, rz: number, h: number, centre: Vector3, angle: number, snowy: boolean, detail: number) {
  const g = new IcosahedronGeometry(1, detail), p = g.attributes.position, normal = g.attributes.normal;
  const colors = new Float32Array(p.count * 3), c = new Color(), n = new Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), az = Math.atan2(z, x);
    const lobe = .89 + .14 * Math.cos(az * 3 + angle) + .09 * Math.cos(az * 5 - angle);
    const dip = -.17 * Math.hypot(x, z) + .19 * Math.sin(az * 2 + angle);
    p.setXYZ(i, centre.x + x * lobe * rx, centre.y + (y + dip) * h, centre.z + z * lobe * rz);
    n.set(x / rx, y / h, z / rz).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
    c.copy(inner).lerp(needles, Math.min(1, Math.max(0, .48 + y * .41 + .15 * Math.cos(az * 6 + angle))));
    if (snowy && y > .32) c.lerp(frost, Math.min(.76, (y - .32) * 1.1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

/** Uneven, spreading clusters below the exposed summit. Crown tiers are broken up by side branches. */
function cedarGeometry() {
  const geos: BufferGeometry[] = [];
  const trunkH = CEDAR.trunkH * CEDAR_HEIGHT;
  const trunk = new CylinderGeometry(CEDAR.trunkR * .5, CEDAR.trunkR * 1.35, trunkH + .8, 7, 4);
  const tp = trunk.attributes.position;
  const barkColors = new Float32Array(tp.count * 3), darkBark = new Color('#433b30'), lightBark = new Color('#6e6351'), c = new Color();
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i), t = (y + (trunkH + .8) * .5) / (trunkH + .8);
    const bend = Math.sin(t * Math.PI * 1.3) * .25;
    tp.setXYZ(i, tp.getX(i) + bend, y + trunkH / 2 - .4, tp.getZ(i) - bend * .5);
    c.copy(darkBark).lerp(lightBark, t);
    barkColors.set([c.r, c.g, c.b], i * 3);
  }
  trunk.setAttribute('color', new BufferAttribute(barkColors, 3));
  const trunkOut = trunk.toNonIndexed();
  trunk.dispose();
  geos.push(trunkOut);
  for (const [i, tier] of CEDAR_TIERS.entries()) {
    const y = tier.y * CEDAR_HEIGHT, h = tier.h * CEDAR_HEIGHT, r = tier.r;
    geos.push(bough(r * 1.55, r * 1.23, h * .64, new Vector3(tier.dx, y, tier.dz), i * 1.7, i >= 2, 1));
    for (let j = 0; j < 3; j++) {
      const az = i * 2.4 + j * 2.1;
      const x = Math.cos(az) * r * (1.3 + j * .21), z = Math.sin(az) * r * (1.18 + j * .16);
      geos.push(bough(r * (.92 - j * .08), r * (.71 + j * .05), h * .46,
        new Vector3(tier.dx + x, y - h * (.83 - j * .36), tier.dz + z), az, i === 3 && j !== 1, 0));
    }
  }
  const merged = mergeGeometries(geos)!;
  geos.forEach(g => g.dispose());
  return merged;
}

export default function Cedars() {
  const mesh = useMemo(() => {
    const cedars = makeCedars(), mat = new MeshStandardMaterial({ vertexColors: true, roughness: .98 });
    const m = new InstancedMesh(cedarGeometry(), mat, cedars.length);
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

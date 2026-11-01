import { useEffect, useMemo } from 'react';
import { BufferAttribute, type BufferGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Euler, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEDAR, CEDAR_HEIGHT, CEDAR_TIERS, makeCedars } from './cedarData';

function boughPlate(rx: number, rz: number, h: number, y: number, dx: number, dz: number, seed: number, topHex: string, botHex: string, frost = 0.18) {
  // CylinderGeometry(radiusTop, radiusBottom, height): narrow top and wide spreading base so boughs form natural conical cedar tiers.
  const g = new CylinderGeometry(rx * .22, rx * 1.45, h, 14, 3), p = g.attributes.position;
  const top = new Color(topHex), bot = new Color(botHex), snow = new Color('#e8e4dc'), c = new Color();
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), a = Math.atan2(vz, vx);
    const lobe = .86 + .16 * Math.sin(a * 3 + seed) + .10 * Math.cos(a * 5 - seed * 1.7);
    const rad = Math.hypot(vx, vz) / Math.max(rx * 1.45, .1);
    const droop = -rad * rad * h * .28 + .04 * Math.sin(a * 4 + seed);
    p.setXYZ(i, vx * lobe + dx, vy + droop + y, vz * (rz / rx) * lobe + dz);
    const t = Math.min(1, Math.max(0, (vy / h) + .5));
    c.copy(bot).lerp(top, t);
    if (vy > h * .12 && y > CEDAR_HEIGHT * .72) c.lerp(snow, frost);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const out = g.toNonIndexed(); g.dispose();
  return out;
}

/** One Cedar of Lebanon as merged, smooth-shaded geometry: gnarled trunk + wide conical tabular boughs + frost-dusted crown. */
function cedarGeometry() {
  const geos: BufferGeometry[] = [];
  const trunkH = CEDAR.trunkH * CEDAR_HEIGHT;
  const trunk = new CylinderGeometry(CEDAR.trunkR * .52, CEDAR.trunkR * 1.45, trunkH + 1.2, 10, 4), tp = trunk.attributes.position;
  const barkColors = new Float32Array(tp.count * 3), darkBark = new Color('#3b2820'), warmBark = new Color('#5e4132');
  for (let i = 0; i < tp.count; i++) {
    const vy = tp.getY(i), t = (vy + (trunkH + 1.2) / 2) / (trunkH + 1.2);
    const bend = Math.sin(t * Math.PI * 1.3) * .18;
    tp.setXYZ(i, tp.getX(i) + bend, vy + trunkH / 2 - .6, tp.getZ(i) - bend * .5);
    const bc = darkBark.clone().lerp(warmBark, t);
    barkColors.set([bc.r, bc.g, bc.b], i * 3);
  }
  trunk.setAttribute('color', new BufferAttribute(barkColors, 3));
  trunk.computeVertexNormals();
  const trunkOut = trunk.toNonIndexed(); trunk.dispose();
  geos.push(trunkOut);
  for (const [i, tier] of CEDAR_TIERS.entries()) {
    const y = tier.y * CEDAR_HEIGHT, h = tier.h * CEDAR_HEIGHT * 1.25;
    geos.push(boughPlate(tier.r * 1.65, tier.r * 1.48, h, y, tier.dx, tier.dz, i * 2.1 + 1,
      i % 2 ? '#345e50' : '#2b5246', '#18302c', 0.16));
    geos.push(boughPlate(tier.r * 1.25, tier.r * 1.35, h * .9, y + .28, -tier.dx * 1.15, -tier.dz * 1.1, i * 3.7 + 4,
      '#3d6b5b', '#1c3833', 0.20));
  }
  geos.push(boughPlate(CEDAR.snowR * 1.15, CEDAR.snowR * 1.08, .12 * CEDAR_HEIGHT, CEDAR.snowY * CEDAR_HEIGHT, 0, 0, 9.4,
    '#497866', '#26473f', 0.35));
  const merged = mergeGeometries(geos)!;
  geos.forEach(g => g.dispose());
  return merged;
}

/** Living cedars on the banks: one instanced draw with smooth dawn foliage shading, no colliders. */
export default function Cedars() {
  const mesh = useMemo(() => {
    const cedars = makeCedars();
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: .02, flatShading: false });
    mat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.2);
        float lum = dot(gl_FragColor.rgb, vec3(.299, .587, .114));
        vec3 dawnFoliage = mix(vec3(.22, .26, .34) * gl_FragColor.rgb, gl_FragColor.rgb * 1.06, smoothstep(.05, .42, lum));
        dawnFoliage += vec3(.98, .82, .52) * smoothstep(.35, .80, fresnel) * .16;
        gl_FragColor.rgb = dawnFoliage;
        #include <dithering_fragment>`);
    };
    mat.customProgramCacheKey = () => 'cedars-dawn-conifer-v3';
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

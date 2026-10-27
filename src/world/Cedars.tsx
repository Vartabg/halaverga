import { useEffect, useMemo } from 'react';
import { BufferAttribute, type BufferGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Euler, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEDAR, CEDAR_HEIGHT, CEDAR_TIERS, makeCedars } from './cedarData';

function boughPlate(rx: number, rz: number, h: number, y: number, dx: number, dz: number, seed: number, topHex: string, botHex: string) {
  const g = new CylinderGeometry(rx * .92, rx * .68, h, 9, 2), p = g.attributes.position;
  const top = new Color(topHex), bot = new Color(botHex), sunNeedle = new Color('#3a7566'), c = new Color();
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), a = Math.atan2(vz, vx);
    const lobe = .82 + .22 * Math.sin(a * 3 + seed) + .12 * Math.cos(a * 5 - seed * 1.7);
    const droop = vy < 0 ? -.12 * Math.hypot(vx, vz) / Math.max(rx, .1) : .05 * Math.sin(a * 4 + seed);
    p.setXYZ(i, vx * lobe + dx, vy + droop + y, vz * (rz / rx) * lobe + dz);
    const t = Math.min(1, Math.max(0, (vy / h) + .5));
    c.copy(bot).lerp(top, t);
    if (vy > h * .18 && y > CEDAR_HEIGHT * .68) c.lerp(sunNeedle, .38);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  const out = g.toNonIndexed(); g.dispose(); out.computeVertexNormals();
  return out;
}

/** One Cedar of Lebanon as merged, vertex-coloured geometry: gnarled forked trunk + wide horizontal tabular boughs + snow crown. */
function cedarGeometry() {
  const geos: BufferGeometry[] = [];
  const trunkH = CEDAR.trunkH * CEDAR_HEIGHT;
  const trunk = new CylinderGeometry(CEDAR.trunkR * .58, CEDAR.trunkR * 1.65, trunkH + 1.4, 7, 4), tp = trunk.attributes.position;
  const barkColors = new Float32Array(tp.count * 3), darkBark = new Color('#36211c'), warmBark = new Color('#5e3b2e');
  for (let i = 0; i < tp.count; i++) {
    const vy = tp.getY(i), t = (vy + (trunkH + 1.4) / 2) / (trunkH + 1.4);
    const bend = Math.sin(t * Math.PI * 1.3) * .22;
    tp.setXYZ(i, tp.getX(i) + bend, vy + trunkH / 2 - .7, tp.getZ(i) - bend * .5);
    const bc = darkBark.clone().lerp(warmBark, t);
    barkColors.set([bc.r, bc.g, bc.b], i * 3);
  }
  trunk.setAttribute('color', new BufferAttribute(barkColors, 3));
  const trunkOut = trunk.toNonIndexed(); trunk.dispose(); trunkOut.computeVertexNormals();
  geos.push(trunkOut);
  for (const [i, tier] of CEDAR_TIERS.entries()) {
    const y = tier.y * CEDAR_HEIGHT, h = tier.h * CEDAR_HEIGHT;
    geos.push(boughPlate(tier.r * 1.38, tier.r * 1.18, h, y, tier.dx, tier.dz, i * 2.1 + 1,
      i % 2 ? '#295e52' : '#1f4d44', '#122b29'));
    geos.push(boughPlate(tier.r * .96, tier.r * 1.08, h * .85, y + .22, -tier.dx * 1.25, -tier.dz * 1.15, i * 3.7 + 4,
      '#316b5d', '#163330'));
  }
  geos.push(boughPlate(CEDAR.snowR * 1.28, CEDAR.snowR * 1.12, .09 * CEDAR_HEIGHT, CEDAR.snowY * CEDAR_HEIGHT, 0, 0, 9.4,
    '#367262', '#1a3a33'));
  const merged = mergeGeometries(geos)!;
  geos.forEach(g => g.dispose());
  return merged;
}

/** Living cedars on the banks: one instanced draw with Hades cel-and-ink shading, no colliders. */
export default function Cedars() {
  const mesh = useMemo(() => {
    const cedars = makeCedars();
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .05, flatShading: true });
    mat.onBeforeCompile = shader => {
      // flatShading means three.js derives the normal in the fragment shader and declares no vNormal varying, so the ink
      // term reads the normal that normal_fragment_begin just computed instead.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n        vec3 inkNormal = normal;')
        .replace('#include <dithering_fragment>', `
        float edgeInk = smoothstep(.20, .48, length(fwidth(inkNormal)));
        float lum = dot(gl_FragColor.rgb, vec3(.299, .587, .114));
        float cel = mix(.62, 1.16, floor(clamp(lum * 3.2, 0., 2.99)) / 2.);
        vec3 celCol = mix(vec3(.11, .14, .24), gl_FragColor.rgb * cel, smoothstep(.06, .34, lum));
        gl_FragColor.rgb = mix(celCol, vec3(.05, .04, .10), edgeInk * .88);
        #include <dithering_fragment>`);
    };
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

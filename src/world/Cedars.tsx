import { useEffect, useMemo } from 'react';
import { BufferAttribute, Color, ConeGeometry, CylinderGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Euler, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEDAR, CEDAR_HEIGHT, CEDAR_TIERS, makeCedars } from './cedarData';

/** One cedar as merged, vertex-coloured geometry: brown trunk, dark dawn-green tiers, snow on the top tier. */
function cedarGeometry() {
  const parts: { g: ConeGeometry | CylinderGeometry; color: Color }[] = [];
  const trunk = new CylinderGeometry(CEDAR.trunkR, CEDAR.trunkR * 1.5, CEDAR.trunkH * CEDAR_HEIGHT, 6);
  trunk.translate(0, CEDAR.trunkH * CEDAR_HEIGHT / 2, 0);
  parts.push({ g: trunk, color: new Color('#523528') });
  for (const [i, tier] of CEDAR_TIERS.entries()) {
    const cone = new ConeGeometry(tier.r * 2, tier.h * CEDAR_HEIGHT, 8);
    cone.translate(0, tier.y * CEDAR_HEIGHT, 0);
    parts.push({ g: cone, color: new Color(i % 2 ? '#266b5c' : '#1b5247') });
  }
  const snow = new ConeGeometry(CEDAR.snowR * 2, .16 * CEDAR_HEIGHT, 8);
  snow.translate(0, CEDAR.snowY * CEDAR_HEIGHT, 0);
  parts.push({ g: snow, color: new Color('#f6efe2') });
  const geos = parts.map(({ g, color }) => {
    const n = g.attributes.position.count, colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    return g.toNonIndexed();
  });
  return mergeGeometries(geos)!;
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

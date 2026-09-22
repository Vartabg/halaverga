import { AdditiveBlending, BoxGeometry, BufferGeometry, Color, DataTexture, IcosahedronGeometry, LinearFilter,
  LinearMipmapLinearFilter, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RGBAFormat, SphereGeometry, TorusGeometry,
  type WebGLProgramParametersWithUniforms } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DRONE_COLORS = { body: '#3a4048', plate: '#4a525c', eyeIdle: '#ffb347', eyeAlert: '#ff5a36', telegraph: '#ffffff', rim: '#ffb347', flash: '#ffffff' } as const;
/** Arm tip radius and height: the rotors sit on the shell rim (outer edge .62 + .31 = .93 m) so the arms and rings read outside the hull. */
const ARM_R = .62, ARM_Y = .05;

function merge(parts: BufferGeometry[]) {
  const flat = parts.map(g => g.index ? g.toNonIndexed() : g), out = mergeGeometries(flat);
  parts.forEach(g => g.dispose()); flat.forEach(g => g.dispose());
  if (!out) throw new Error('drone geometry merge failed');
  return out;
}
/** Original low-poly drone, facing -Z. The eye is a separate unit sphere instance placed at eyeCenter(). */
export function buildDroneGeometry() {
  const parts: BufferGeometry[] = [new IcosahedronGeometry(.55, 1)];
  for (const deg of [45, 135]) parts.push(new BoxGeometry(ARM_R * 2, .08, .12).rotateY(deg * Math.PI / 180).translate(0, ARM_Y, 0));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    parts.push(new TorusGeometry(.28, .03, 6, 16).rotateX(Math.PI / 2).translate(Math.cos(a) * ARM_R, ARM_Y, Math.sin(a) * ARM_R));
  }
  parts.push(new SphereGeometry(.62, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
  return {
    body: merge(parts),
    plate: merge([new SphereGeometry(.64, 12, 5, 0, Math.PI * 2, 0, Math.PI * .42)]),
    eye: new SphereGeometry(.32, 12, 8),
    halo: new PlaneGeometry(1, 1),
  };
}
/** World size that covers `px` CSS pixels at distance `dist` for a vertical FOV in degrees. */
export const minWorldSize = (px: number, dist: number, fovDeg: number, heightPx: number) =>
  px * dist * 2 * Math.tan(fovDeg * Math.PI / 360) / heightPx;

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function radialTexture(alpha: (r: number) => number) {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + .5) / (n / 2) - 1, v = (y + .5) / (n / 2) - 1, o = (y * n + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = 255; data[o + 3] = Math.round(255 * alpha(Math.sqrt(u * u + v * v)));
  }
  const tex = new DataTexture(data, n, n, RGBAFormat);
  tex.magFilter = LinearFilter; tex.minFilter = LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}
/** Soft glow: (1 - r)^2, zero outside the inscribed circle. */
export const haloAlpha = (r: number) => { const k = Math.max(0, 1 - r); return k * k; };
/** Thin ring: rises over .78..(.78+.07), falls over (1-.12)..1, so it peaks near r .85 and ends at the quad's inscribed edge. */
export const ringAlpha = (r: number) => smooth(.78, .85, r) * (1 - smooth(1 - .12, 1, r));

const CACHE_KEY = 'halaverga-drone-flash-rim';
function flashRim(material: MeshStandardMaterial, rim: number) {
  const uRim = { value: new Color(DRONE_COLORS.rim).multiplyScalar(rim) };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uRim = uRim;
    shader.vertexShader = 'attribute float aFlash;\nvarying float vFlash;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvFlash = aFlash;');
    shader.fragmentShader = 'varying float vFlash;\nuniform vec3 uRim;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(vFlash) * 1.6 + uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
    `);
  };
  material.customProgramCacheKey = () => CACHE_KEY;
  return material;
}
export function createDroneMaterials() {
  const haloTexture = radialTexture(haloAlpha), ringTexture = radialTexture(ringAlpha);
  const glow = (map: DataTexture) => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false });
  const m = {
    body: flashRim(new MeshStandardMaterial({ color: DRONE_COLORS.body, metalness: .6, roughness: .45 }), .35),
    plate: flashRim(new MeshStandardMaterial({ color: DRONE_COLORS.plate, metalness: .6, roughness: .45 }), .25),
    eye: new MeshBasicMaterial({ toneMapped: false }),
    halo: glow(haloTexture), ring: glow(ringTexture), haloTexture, ringTexture,
    dispose() {
      m.body.dispose(); m.plate.dispose(); m.eye.dispose(); m.halo.dispose(); m.ring.dispose();
      haloTexture.dispose(); ringTexture.dispose();
    },
  };
  return m;
}

import { AdditiveBlending, Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial,
  MeshStandardMaterial, RGBAFormat, Vector2, type WebGLProgramParametersWithUniforms } from 'three';
import { createMembraneRig, membraneSkinGLSL } from './membraneRig';
import { makeWatcherGeometry } from './watcherGeometry';
import { WATCHER_JOINTS } from './watcherWings';
import { featherAtlas } from './featherAtlas';
/** feather: the dark tint over the feather atlas; blade: the Watchers' bronze, near the cuirass (watcher.glb `watcher bronze`). */
export const DRONE_COLORS = { feather: '#3a3036', blade: '#b08a52', eyeIdle: '#ff5f19', eyeAlert: '#ff541a', telegraph: '#fff7de', rim: '#8c391e', flash: '#ffffff' } as const;
/** Public engine name retained for the combat pool: the pooled pieces of the Watchers (watcherGeometry.ts). */
export const buildDroneGeometry = makeWatcherGeometry;
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

const CACHE_KEY = 'halaverga-watcher-feather-wings-v1';
/** A damaged Watcher's wings glow this colour (linear) from within; aDamage scales it (Drones.tsx). */
export const EMBER_GLOW = new Color('#ff5a18');
/**
 * The wings' shader hooks, kept from the drone shader: the per-instance flash (the gated white hit flash, aFlash) and damage
 * (aDamage: 0 whole, about .45 broken, .75-1 failing) lighting the plumage from inside with an ember glow, a rim light, and the
 * instanced membrane skin (each instance's shoulder, elbow and wrist from the rig's pose texture).
 */
function flashRim(material: MeshStandardMaterial, rim: number, wings: ReturnType<typeof createMembraneRig>) {
  const uRim = { value: new Color(DRONE_COLORS.rim).multiplyScalar(rim) }, uEmber = { value: EMBER_GLOW };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uRim = uRim; shader.uniforms.uEmber = uEmber; shader.uniforms.uWingPose = { value: wings.texture };
    shader.vertexShader = 'attribute float aFlash;\nvarying float vFlash;\nattribute float aDamage;\nvarying float vDamage;\nvarying vec3 vLocal;\n'
      + membraneSkinGLSL + shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
objectNormal = mat3(hostWingSkin()) * objectNormal;
`).replace('#include <begin_vertex>', `#include <begin_vertex>
vFlash = aFlash; vDamage = aDamage; vLocal = position;
transformed = (hostWingSkin() * vec4(transformed, 1.0)).xyz;
`);
    shader.fragmentShader = 'varying float vFlash;\nuniform vec3 uRim;\nvarying float vDamage;\nvarying vec3 vLocal;\nuniform vec3 uEmber;\n'
      + shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(vFlash) * 1.6 + uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
      float exposed = smoothstep(0.18, 0.5, vLocal.y) + 0.25 * (1.0 - smoothstep(0.0, 0.35, abs(vLocal.y)));
      totalEmissiveRadiance += uEmber * exposed * vDamage * 3.0;
    `);
  };
  material.customProgramCacheKey = () => CACHE_KEY;
  return material;
}
export function createDroneMaterials() {
  const wings = createMembraneRig(WATCHER_JOINTS), atlas = featherAtlas();
  const haloTexture = radialTexture(haloAlpha), ringTexture = radialTexture(ringAlpha);
  const glow = (map: DataTexture) => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false });
  // Alpha-tested with alpha-to-coverage like the archangel's plumage (featherMaterial.ts): opaque cost, no sorting.
  const feather = flashRim(new MeshStandardMaterial({ color: DRONE_COLORS.feather, vertexColors: true, map: atlas.colour, normalMap: atlas.normal,
    normalScale: new Vector2(.55, .55), alphaTest: .42, alphaToCoverage: true, metalness: .05, roughness: .72, side: DoubleSide }), .35, wings);
  const m = {
    feather, wings, atlas,
    blade: new MeshStandardMaterial({ color: DRONE_COLORS.blade, metalness: .82, roughness: .34, flatShading: true }),
    eye: new MeshBasicMaterial({ toneMapped: false }),
    halo: glow(haloTexture), ring: glow(ringTexture), haloTexture, ringTexture,
    dispose() {
      wings.dispose(); m.feather.dispose(); atlas.colour.dispose(); atlas.normal.dispose(); m.blade.dispose(); m.eye.dispose();
      m.halo.dispose(); m.ring.dispose(); haloTexture.dispose(); ringTexture.dispose();
    },
  };
  return m;
}

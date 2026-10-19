import { AdditiveBlending, Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial,
  MeshStandardMaterial, RGBAFormat, type WebGLProgramParametersWithUniforms } from 'three';
import { makeDemonGeometry } from './demonGeometry';
export const DRONE_COLORS = { body: '#6c3025', plate: '#7e6845', eyeIdle: '#ff5f19', eyeAlert: '#ff541a', telegraph: '#fff7de', rim: '#8c391e', flash: '#ffffff' } as const;
/** Public engine name retained for the combat pool; the rendered adversaries are original abyssal creatures. */
export const buildDroneGeometry = makeDemonGeometry;
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

const CACHE_KEY = 'halaverga-host-flash-rim-motion-v2';
/** The exposed core glows this colour (linear) through the open top once the plate is gone; aDamage scales it (Drones.tsx). */
export const EMBER_GLOW = new Color('#ff5a18');
/**
 * Per-instance flash (the gated white hit flash, aFlash) and damage (aDamage: 0 whole, about .45 broken, .75-1 failing). Damage lights
 * the shell from inside: an ember glow fading in over the open top (local y above .18, where the plate sat) and leaking through the
 * seams of the lower hull, so a damaged drone reads as a hull with a fire in it from any side, at range.
 */
function flashRim(material: MeshStandardMaterial, rim: number, clock: { value: number }) {
  const uRim = { value: new Color(DRONE_COLORS.rim).multiplyScalar(rim) }, uEmber = { value: EMBER_GLOW };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uRim = uRim; shader.uniforms.uEmber = uEmber;
    shader.uniforms.uHostClock = clock;
    shader.vertexShader = 'attribute float aFlash;\nvarying float vFlash;\nattribute float aDamage;\nvarying float vDamage;\nvarying vec3 vLocal;\nattribute float aPhase;\nuniform float uHostClock;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vFlash = aFlash; vDamage = aDamage; vLocal = position;
float beat = uHostClock * 2.2 + aPhase;
float limb = smoothstep(.26, .48, abs(position.x)) * (1. - smoothstep(.72, .86, abs(position.x)))
  * (1. - smoothstep(.30, .45, position.y)) * smoothstep(-.34, -.15, position.y) * (1. - smoothstep(.10, .22, position.z));
transformed.z += sin(beat + sign(position.x) * .7) * limb * .07;
float knee = 1. - smoothstep(-.65, -.36, position.y);
transformed.z += sin(beat * .65 + sign(position.x)) * knee * .055;
transformed.z += sin(beat) * .009 * (1. - smoothstep(.18, .30, abs(position.x))) * smoothstep(-.2, .1, position.y) * (1. - smoothstep(.40, .55, position.y));
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
  const clock = { value: 0 };
  const haloTexture = radialTexture(haloAlpha), ringTexture = radialTexture(ringAlpha);
  const glow = (map: DataTexture) => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false });
  const m = {
    body: flashRim(new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, color: '#ffffff', metalness: .13, roughness: .73 }), .35, clock),
    plate: flashRim(new MeshStandardMaterial({ vertexColors: true, color: '#ffffff', metalness: .38, roughness: .47 }), .25, clock), clock,
    eye: new MeshBasicMaterial({ toneMapped: false }),
    halo: glow(haloTexture), ring: glow(ringTexture), haloTexture, ringTexture,
    dispose() {
      m.body.dispose(); m.plate.dispose(); m.eye.dispose(); m.halo.dispose(); m.ring.dispose();
      haloTexture.dispose(); ringTexture.dispose();
    },
  };
  return m;
}

// The flaming sword's parts (Genesis 3:24): a tapered longsword and the fire that runs along it. The sword is modelled along -Y
// from the grip at the origin (swordGrip.ts turns it into the fist). Original procedural geometry.
import { AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, IcosahedronGeometry, ShaderMaterial, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Blade length from the guard to the point, and where the guard sits below the grip's middle (m). */
export const BLADE = 1.22, GUARD = .1;
/** A diamond-section blade: a long tapering body and a point, wide and thin. `wide` scales the section (the fire uses a fatter one). */
function bladeShape(wide: number, length: number) {
  const body = length * .72, tip = length - body;
  const lower = new CylinderGeometry(.03, .041, body, 4, 1).translate(0, -GUARD - body / 2, 0);
  const point = new ConeGeometry(.03, tip, 4, 1).rotateX(Math.PI).translate(0, -GUARD - body - tip / 2, 0);
  // Four sides turned so an edge, not a face, leads the cut; then flattened into a blade.
  const g = mergeGeometries([lower, point])!; lower.dispose(); point.dispose();
  return g.rotateY(Math.PI / 4).scale(wide, 1, wide * .3);
}
export function swordGeometry(): BufferGeometry {
  const parts = [bladeShape(1.25, BLADE), new BoxGeometry(.27, .034, .05).translate(0, -GUARD + .012, 0),
    new BoxGeometry(.06, .05, .06).translate(0, -GUARD + .012, 0), new CylinderGeometry(.017, .02, .17, 6).translate(0, .01, 0),
    new IcosahedronGeometry(.034, 0).translate(0, .115, 0)].map(g => g.index ? g.toNonIndexed() : g);
  for (const g of parts) g.deleteAttribute('uv');
  const merged = mergeGeometries(parts)!; parts.forEach(g => g.dispose()); merged.computeVertexNormals();
  return merged;
}
/** The fire's shell: the blade's own shape, fatter and a little longer, so the flame clings to the steel. */
export const flameGeometry = () => bladeShape(2.3, BLADE * 1.1);

/** Fire that climbs the blade: two layers of rolling noise, hottest along the steel, licking sideways toward the point. uFlare
 * (0 to 1) swells and brightens it for a cut. Additive; no texture. */
export function flameMaterial() {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uFlare: { value: 0 } },
    vertexShader: `uniform float uTime; uniform float uFlare; varying vec3 vP;
      void main() {
        vP = position; vec3 p = position;
        float along = clamp((-position.y - ${GUARD.toFixed(2)}) / ${BLADE.toFixed(2)}, 0., 1.);
        p.x += sin(uTime * 9. + position.y * 13.) * .014 * along * (1. + uFlare * 1.5);
        p.xz *= 1. + uFlare * .5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform float uTime; uniform float uFlare; varying vec3 vP;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
      }
      void main() {
        float along = clamp((-vP.y - ${GUARD.toFixed(2)}) / ${BLADE.toFixed(2)}, 0., 1.);
        float across = (vP.x + vP.z) * 22.;
        float n = noise(vec2(across, vP.y * 7. + uTime * 4.4)) * .65 + noise(vec2(across * 2.1, vP.y * 15. + uTime * 7.3)) * .35;
        float body = smoothstep(.3, .85, n + .32 - along * .22 + uFlare * .3);
        vec3 fire = mix(vec3(1., .4, .07), vec3(1., .88, .55), body);
        float a = body * (.5 + .4 * uFlare) * (1. - along * .3);
        gl_FragColor = vec4(fire * a, a);
      }`,
  });
}

import { Group, Mesh, MeshStandardMaterial, TorusGeometry, Vector3, type Object3D } from 'three';
import { characterSurface } from './characterSurface';

const HADES_FRAG = `
  float edgeInk = smoothstep(0.24, 0.56, length(fwidth(vNormal)));
  float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
  float rimStep = smoothstep(0.42, 0.68, fresnel);
  float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
  float cel = mix(0.72, 1.14, floor(clamp(lum * 3.2, 0.0, 2.99)) / 2.0);
  vec3 celCol = mix(vec3(0.14, 0.10, 0.24), gl_FragColor.rgb * cel, smoothstep(0.06, 0.30, lum));
  celCol += vec3(0.99, 0.78, 0.36) * rimStep * 0.36;
  gl_FragColor.rgb = mix(celCol, vec3(0.05, 0.03, 0.09), edgeInk * 0.85);
  #include <dithering_fragment>`;

/** Art direction additions to the fitted GLB: a fine nimbus, Hades cel-and-ink shading, and movement in its authored cloth and hair. */
export function angelRegalia(body: Object3D, joints: Object3D[], sway = new Vector3(), hair = new Vector3()) {
  const releaseSurface = characterSurface(body);
  const root = new Group(), flutter = { value: 0 };
  const gold = new MeshStandardMaterial({ color: '#f5d27a', metalness: .85, roughness: .22, emissive: '#9c6b1c', emissiveIntensity: .42 });
  const rings = [.256, .276].map(radius => {
    const m = new Mesh(new TorusGeometry(radius, .0038, 6, 80), gold); root.add(m); return m;
  });
  root.position.set(0, .16, .15); joints[1].add(root);
  const patched = new Set<MeshStandardMaterial>();
  body.traverse(o => {
    if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial) || patched.has(o.material)) return;
    const m = o.material; patched.add(m);
    if (m.name === 'Chestnut hair') {
      m.onBeforeCompile = shader => {
        shader.uniforms.uHairSway = { value: hair };
        shader.vertexShader = 'uniform vec3 uHairSway;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed += uHairSway * (1. - smoothstep(.6, .86, position.y)) * (.35 + .65 * smoothstep(-.06, .1, position.z));
        `);
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', HADES_FRAG);
      };
      m.customProgramCacheKey = () => 'celestial-hair-hades-v2'; m.needsUpdate = true;
      return;
    }
    if (['Ivory linen', 'Crimson silk'].includes(m.name)) {
      m.onBeforeCompile = shader => {
        shader.uniforms.uClothTime = flutter; shader.uniforms.uClothSway = { value: sway };
        shader.vertexShader = 'uniform float uClothTime;\nuniform vec3 uClothSway;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float hem = 1. - smoothstep(-.55, .05, position.y), hang = clamp((.45 - position.y) / 1.5, 0., 1.);
          transformed.z += sin(uClothTime * 3.4 + position.x * 17. + position.y * 5.) * hem * .018;
          transformed += uClothSway * hang * hang;
        `);
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', HADES_FRAG);
      };
      m.customProgramCacheKey = () => 'celestial-cloth-hades-v2-' + m.name; m.needsUpdate = true;
      return;
    }
    m.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', HADES_FRAG);
    };
    m.customProgramCacheKey = () => 'celestial-hades-v2-' + m.name; m.needsUpdate = true;
  });
  return {
    step(dt: number, still: boolean, vx = 0, vy = 0, vz = 0) {
      if (!still) {
        flutter.value += Math.min(dt, .04);
        const k = Math.min(1, dt * 8);
        sway.set(sway.x + (-vx * .006 - sway.x) * k, sway.y + (-vy * .004 - sway.y) * k, sway.z + (-vz * .006 - sway.z) * k);
        hair.set(hair.x + (-vx * .002 - hair.x) * k, hair.y + (-vy * .002 - hair.y) * k, hair.z + (-vz * .002 - hair.z) * k);
      }
    },
    dispose() {
      releaseSurface(); root.removeFromParent(); rings.forEach(m => m.geometry.dispose()); gold.dispose();
      patched.forEach(m => { m.onBeforeCompile = () => {}; });
    },
  };
}

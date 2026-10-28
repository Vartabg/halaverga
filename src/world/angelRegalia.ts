import { Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import { characterSurface } from './characterSurface';

const DAWN_FRAG = `
  float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.4);
  float rim = smoothstep(0.32, 0.78, fresnel);
  float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 dawnCol = mix(vec3(0.24, 0.26, 0.38) * gl_FragColor.rgb, gl_FragColor.rgb * 1.06, smoothstep(0.04, 0.42, lum));
  dawnCol += vec3(0.99, 0.84, 0.52) * rim * 0.28;
  gl_FragColor.rgb = dawnCol;
  #include <dithering_fragment>`;

/** Art direction additions to the fitted GLB: soft dawn rim illumination and wind-driven movement in its authored cloth and hair. */
export function angelRegalia(body: Object3D, _joints: Object3D[], sway = new Vector3(), hair = new Vector3()) {
  const releaseSurface = characterSurface(body);
  const flutter = { value: 0 };
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
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', DAWN_FRAG);
      };
      m.customProgramCacheKey = () => 'celestial-hair-dawn-v3'; m.needsUpdate = true;
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
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', DAWN_FRAG);
      };
      m.customProgramCacheKey = () => 'celestial-cloth-dawn-v3-' + m.name; m.needsUpdate = true;
      return;
    }
    m.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', DAWN_FRAG);
    };
    m.customProgramCacheKey = () => 'celestial-dawn-v3-' + m.name; m.needsUpdate = true;
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
      releaseSurface();
      patched.forEach(m => { m.onBeforeCompile = () => {}; });
    },
  };
}

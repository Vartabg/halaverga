// The archangel's regalia over the realistic body (archangel.glb, scripts/real_bodies): a fine gold nimbus on the head and movement
// in the hair and the chiton. The body keeps its own lit materials: the old cel-and-ink fragment is not applied to the realistic
// bodies (docs/plans/2026-11-16-real-fight.md B6).
import { Group, Mesh, MeshStandardMaterial, TorusGeometry, Vector3, type Object3D } from 'three';

/** The materials that move, by their names in archangel.glb (scripts/real_bodies/materials.py). */
export const REGALIA_MATERIALS = { hair: 'archangel hair', cloth: 'archangel chiton' } as const;
/** The chiton material also carries the sandals (its sandal swatch): below this height (m from the pelvis at rest) nothing sways. */
export const SANDAL_TOP = -.8;
/** The nimbus centre from the head bone (m): a little above the eyes and just behind the hair (archangel.glb's head bone sits .04 m
 * below the eyes and the hair reaches .11 m behind the pelvis axis). */
export const NIMBUS = [0, .1, .17] as const;

/** sway and hair are the body-local spring offsets (suitSprings.ts) at the hem and at the hair ends; the shaders weight them along
 * each surface. */
export function angelRegalia(body: Object3D, joints: Object3D[], sway = new Vector3(), hair = new Vector3()) {
  const root = new Group(), flutter = { value: 0 };
  const gold = new MeshStandardMaterial({ color: '#f5d27a', metalness: .85, roughness: .22, emissive: '#9c6b1c', emissiveIntensity: .42 });
  const rings = [.256, .276].map(radius => {
    const m = new Mesh(new TorusGeometry(radius, .0038, 6, 80), gold); root.add(m); return m;
  });
  root.position.set(...NIMBUS); joints[1].add(root);
  const patched = new Set<MeshStandardMaterial>();
  body.traverse(o => {
    if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial) || patched.has(o.material)) return;
    const m = o.material;
    if (m.name === REGALIA_MATERIALS.hair) {
      m.onBeforeCompile = shader => {
        shader.uniforms.uHairSway = { value: hair };
        shader.vertexShader = 'uniform vec3 uHairSway;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed += uHairSway * (1. - smoothstep(.6, .86, position.y)) * (.35 + .65 * smoothstep(-.06, .1, position.z));
        `);
      };
      m.customProgramCacheKey = () => 'archangel-hair-v1';
    } else if (m.name === REGALIA_MATERIALS.cloth) {
      m.onBeforeCompile = shader => {
        shader.uniforms.uClothTime = flutter; shader.uniforms.uClothSway = { value: sway };
        shader.vertexShader = 'uniform float uClothTime;\nuniform vec3 uClothSway;\nvarying vec3 vClothRest;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vClothRest = position;
          float shod = smoothstep(${(SANDAL_TOP - .05).toFixed(2)}, ${(SANDAL_TOP + .05).toFixed(2)}, position.y);
          float hem = (1. - smoothstep(-.55, .05, position.y)) * shod, hang = clamp((.45 - position.y) / 1.5, 0., 1.) * shod;
          transformed.z += sin(uClothTime * 3.4 + position.x * 17. + position.y * 5.) * hem * .018;
          transformed += uClothSway * hang * hang;
        `);
        shader.fragmentShader = 'varying vec3 vClothRest;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          #ifdef USE_MAP
          // The first quarter of the chiton atlas is the undyed cloth swatch.
          float diagonal = abs(vClothRest.x - (.57 * vClothRest.y - .19));
          float stitch = max(.002, fwidth(diagonal));
          float sash = 1. - smoothstep(.046 - stitch, .046 + stitch, diagonal);
          float border = smoothstep(.033 - stitch, .033 + stitch, diagonal);
          sash *= smoothstep(.025, .05, vClothRest.y) * (1. - step(.25, vMapUv.x));
          vec3 dye = mix(vec3(.47, .22, .072), vec3(.74, .43, .14), border);
          diffuseColor.rgb = mix(diffuseColor.rgb, dye, .9 * sash);
          #endif
        `);
      };
      m.customProgramCacheKey = () => 'archangel-chiton-v2';
    } else return;
    patched.add(m); m.needsUpdate = true;
  });
  // The springs (suitSprings.ts) own sway and hair; this only advances the hem flutter.
  return {
    step(dt: number, still: boolean) { if (!still) flutter.value += Math.min(dt, .04); },
    dispose() {
      root.removeFromParent(); rings.forEach(m => m.geometry.dispose()); gold.dispose();
      patched.forEach(m => { m.onBeforeCompile = () => {}; });
    },
  };
}

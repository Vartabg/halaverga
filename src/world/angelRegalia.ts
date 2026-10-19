import { Group, Mesh, MeshStandardMaterial, TorusGeometry, Vector3, type Object3D } from 'three';
import { characterSurface } from './characterSurface';

/** Art direction additions to the fitted GLB: a fine nimbus and movement in its authored cloth and hair. sway and hair are the
 * body-local spring offsets (suitSprings.ts) at the hem and at the hair ends; the shaders weight them along each surface. */
export function angelRegalia(body: Object3D, joints: Object3D[], sway = new Vector3(), hair = new Vector3()) {
  const releaseSurface = characterSurface(body);
  const root = new Group(), flutter = { value: 0 };
  const gold = new MeshStandardMaterial({ color: '#e6cb84', metalness: .82, roughness: .26, emissive: '#756331', emissiveIntensity: .18 });
  const rings = [.256, .273].map(radius => {
    const m = new Mesh(new TorusGeometry(radius, .0025, 5, 80), gold); root.add(m); return m;
  });
  root.position.set(0, .16, .15); joints[1].add(root);
  const cloth = new Set<MeshStandardMaterial>();
  body.traverse(o => {
    if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return;
    if (o.material.name === 'Chestnut hair') {
      // Hair ends (lower and toward the back of the head) trail most; the scalp stays put.
      const m = o.material; cloth.add(m);
      m.onBeforeCompile = shader => {
        shader.uniforms.uHairSway = { value: hair };
        shader.vertexShader = 'uniform vec3 uHairSway;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed += uHairSway * (1. - smoothstep(.6, .86, position.y)) * (.35 + .65 * smoothstep(-.06, .1, position.z));
        `);
      };
      m.customProgramCacheKey = () => 'celestial-hair-sway-v1'; m.needsUpdate = true;
      return;
    }
    if (!['Ivory linen', 'Crimson silk'].includes(o.material.name)) return;
    const m = o.material; cloth.add(m);
    m.onBeforeCompile = shader => {
      shader.uniforms.uClothTime = flutter; shader.uniforms.uClothSway = { value: sway };
      shader.vertexShader = 'uniform float uClothTime;\nuniform vec3 uClothSway;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float hem = 1. - smoothstep(-.55, .05, position.y), hang = clamp((.45 - position.y) / 1.5, 0., 1.);
        transformed.z += sin(uClothTime * 3.4 + position.x * 17. + position.y * 5.) * hem * .018;
        transformed += uClothSway * hang * hang;
      `);
    };
    m.customProgramCacheKey = () => 'celestial-authored-cloth-v2';
  });
  return { step(dt: number, still: boolean) { if (!still) flutter.value += Math.min(dt, .04); },
    dispose() { releaseSurface(); root.removeFromParent(); rings.forEach(m => m.geometry.dispose()); gold.dispose();
      cloth.forEach(m => { m.onBeforeCompile = () => {}; }); } };
}

import { Group, Mesh, MeshStandardMaterial, TorusGeometry, type Object3D } from 'three';
import { characterSurface } from './characterSurface';

/** Art direction additions to the fitted GLB: a fine nimbus and subtle movement in its authored cloth. */
export function angelRegalia(body: Object3D, joints: Object3D[]) {
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
    if (!['Ivory linen', 'Crimson silk'].includes(o.material.name)) return;
    const m = o.material; cloth.add(m);
    m.onBeforeCompile = shader => {
      shader.uniforms.uClothTime = flutter;
      shader.vertexShader = 'uniform float uClothTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float hem = 1. - smoothstep(-.55, .05, position.y);
        transformed.z += sin(uClothTime * 3.4 + position.x * 17. + position.y * 5.) * hem * .018;
      `);
    };
    m.customProgramCacheKey = () => 'celestial-authored-cloth-v1';
  });
  return { step(dt: number, still: boolean) { if (!still) flutter.value += Math.min(dt, .04); },
    dispose() { releaseSurface(); root.removeFromParent(); rings.forEach(m => m.geometry.dispose()); gold.dispose();
      cloth.forEach(m => { m.onBeforeCompile = () => {}; }); } };
}

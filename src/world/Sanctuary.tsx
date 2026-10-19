import { useEffect, useMemo } from 'react';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { makeSanctuary } from './sanctuaryData';

export default function Sanctuary() {
  const world = useMemo(makeSanctuary, []);
  const materials = useMemo(() => {
    const stone = new MeshStandardMaterial({ color: '#667780', roughness: .82, metalness: .1 });
    stone.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vStone;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStone = position;');
      shader.fragmentShader = 'varying vec3 vStone;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float vein = abs(sin(vStone.y * .32 + sin(vStone.x * .22 + vStone.z * .17) * 2.1));
        float grain = fract(sin(dot(floor(vStone * 14.), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        diffuseColor.rgb *= .72 + .24 * smoothstep(.05, .18, vein) + .08 * grain;
        diffuseColor.rgb *= .8 + .2 * smoothstep(0., 18., vStone.y);`);
    };
    return [stone, new MeshStandardMaterial({ color: '#a78c58', metalness: .75, roughness: .36 }),
      new MeshBasicMaterial({ color: '#ffe3a1', toneMapped: false })];
  }, []);
  useEffect(() => () => { world.geometry.dispose(); materials.forEach(m => m.dispose()); }, [world, materials]);
  return <RigidBody type="fixed" colliders={false}>
    <mesh geometry={world.geometry} material={materials} castShadow receiveShadow dispose={null} />
    <TrimeshCollider args={[world.vertices, world.indices]} />
  </RigidBody>;
}

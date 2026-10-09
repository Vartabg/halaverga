import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, Vector3 } from 'three';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { SUN_DIRECTION } from './atmospherePalette';
import { waterFragment, waterVertex } from './waterShader';
export { Sky } from './Sky';

/** The sea. The plane follows the camera on x and z (the ripple phases use world position, so they do not slide), so its edge is
 * never in view; it takes the scene fog, so it ends in the same haze as the city and the skyline. */
export function Water() {
  const material = useRef<ShaderMaterial>(null), mesh = useRef<Mesh>(null);
  const uniforms = useMemo(() => UniformsUtils.merge([UniformsLib.fog,
    { time: { value: 0 }, uSun: { value: new Vector3(...SUN_DIRECTION) }, wake: { value: new Vector2() }, wakeStrength: { value: 0 } }]), []);
  useFrame(({ camera }, dt) => {
    mesh.current?.position.set(camera.position.x, .1, camera.position.z);
    if (material.current && !useGame.getState().paused) {
      material.current.uniforms.time.value += Math.min(dt, .04);
      uniforms.wake.value.set(runtime.position.x, runtime.position.z);
      uniforms.wakeStrength.value = Math.exp(-Math.max(0, runtime.position.y - 2) * .65) * Math.min(1, runtime.speed / 10);
    }
  });
  return <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, .1, 0]}>
    <planeGeometry args={[1400, 1400]} />
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={waterVertex} fragmentShader={waterFragment} fog />
  </mesh>;
}

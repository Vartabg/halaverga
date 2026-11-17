import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector2 } from 'three';
import { WORLD } from '@/game/motion';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { waterFragment, waterVertex } from './waterShader';

const waterWidth = WORLD.maxX - WORLD.minX, waterLength = WORLD.maxZ - WORLD.minZ;
const waterCentre = (WORLD.maxZ + WORLD.minZ) / 2;

/** Local meltwater in the gorge, bounded by the same world as its flight interactions. */
export function Water() {
  const uniforms = useMemo(() => ({ time: { value: 0 }, wake: { value: new Vector2() }, wakeStrength: { value: 0 } }), []);
  useFrame((_, dt) => {
    const { paused, reduced } = useGame.getState();
    if (paused) return;
    if (!reduced) uniforms.time.value += Math.min(dt, .04);
    uniforms.wake.value.set(runtime.position.x, runtime.position.z);
    uniforms.wakeStrength.value = Math.exp(-Math.max(0, runtime.position.y - 2) * .65) * Math.min(1, runtime.speed / 10);
  });
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .1, waterCentre]}>
    <planeGeometry args={[waterWidth, waterLength]} />
    <shaderMaterial uniforms={uniforms} vertexShader={waterVertex} fragmentShader={waterFragment} />
  </mesh>;
}

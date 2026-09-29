import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from 'three';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

const COUNT = 140;

export default function EnvironmentParticles() {
  const pointsRef = useRef<Points>(null);
  const data = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - .5) * 44;
      positions[i * 3 + 1] = Math.random() * 24;
      positions[i * 3 + 2] = (Math.random() - .5) * 44;
      velocities[i * 3] = (Math.random() - .5) * .8;
      velocities[i * 3 + 1] = -.15 + (Math.random() - .5) * .25;
      velocities[i * 3 + 2] = .4 + Math.random() * .8;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: '#ffe5a3',
      size: .22,
      transparent: true,
      opacity: .4,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    return { geometry, material, velocities };
  }, []);

  useEffect(() => () => {
    data.geometry.dispose();
    data.material.dispose();
  }, [data]);

  useFrame((_, dt) => {
    if (!pointsRef.current || useGame.getState().paused) return;
    const elapsed = Math.min(dt, .05);
    const attr = data.geometry.attributes.position as Float32BufferAttribute;
    const array = attr.array as Float32Array;
    const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z;

    for (let i = 0; i < COUNT; i++) {
      const idx = i * 3;
      array[idx] += data.velocities[idx] * elapsed;
      array[idx + 1] += data.velocities[idx + 1] * elapsed;
      array[idx + 2] += data.velocities[idx + 2] * elapsed;

      // Wrap particles around player in a toroidal volume
      if (array[idx] - px > 24) array[idx] -= 48;
      else if (array[idx] - px < -24) array[idx] += 48;

      if (array[idx + 1] - py > 16) array[idx + 1] -= 24;
      else if (array[idx + 1] - py < -8) array[idx + 1] += 24;

      if (array[idx + 2] - pz > 24) array[idx + 2] -= 48;
      else if (array[idx + 2] - pz < -24) array[idx + 2] += 48;
    }
    attr.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={data.geometry} material={data.material} />;
}

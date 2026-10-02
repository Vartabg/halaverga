import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, UnsignedByteType, Vector2, Vector3 } from 'three';
import { useGame } from '@/game/store';
import { SUN_DIRECTION, driftClouds } from './atmospherePalette';
import { makeCloudData } from './cloudData';
import { domeFragment, domeVertex } from './skyShader';

const CLOUD_SIZE = 256;

/** The sky dome: one 960-triangle sphere, drawn after the opaque scene so the depth test discards every pixel the city covers. The
 * cloud layer drifts on an accumulated clock that only runs while playing and not under reduced motion; it never asks for a frame. */
export function Sky() {
  const clouds = useMemo(() => {
    const texture = new DataTexture(makeCloudData(CLOUD_SIZE), CLOUD_SIZE, CLOUD_SIZE, RGBAFormat, UnsignedByteType);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter; texture.generateMipmaps = true;
    texture.colorSpace = NoColorSpace; texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => clouds.dispose(), [clouds]);
  const uniforms = useMemo(() => ({ uSun: { value: new Vector3(...SUN_DIRECTION) }, uClouds: { value: clouds }, uWind: { value: new Vector2() } }), [clouds]);
  useFrame((_, dt) => {
    const { paused, reduced } = useGame.getState();
    driftClouds(uniforms.uWind.value, dt, paused || reduced);
  });
  return <mesh renderOrder={1} frustumCulled={false}>
    <sphereGeometry args={[700, 32, 16]} />
    <shaderMaterial side={BackSide} depthWrite={false} toneMapped={false} uniforms={uniforms}
      vertexShader={domeVertex} fragmentShader={domeFragment} />
  </mesh>;
}

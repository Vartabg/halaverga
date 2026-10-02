import { useMemo } from 'react';
import { BackSide, Vector3 } from 'three';
import { SUN_DIRECTION } from './atmospherePalette';
import { domeFragment, domeVertex } from './skyShader';

/** The sky dome: one 960-triangle sphere, drawn after the opaque scene so the depth test discards every pixel the city covers. */
export function Sky() {
  const uniforms = useMemo(() => ({ uSun: { value: new Vector3(...SUN_DIRECTION) } }), []);
  return <mesh renderOrder={1} frustumCulled={false}>
    <sphereGeometry args={[700, 32, 16]} />
    <shaderMaterial side={BackSide} depthWrite={false} toneMapped={false} uniforms={uniforms}
      vertexShader={domeVertex} fragmentShader={domeFragment} />
  </mesh>;
}

import { BackSide } from 'three';
import { domeFragment, domeVertex } from './skyShader';

/** The shader reads the view ray and pins the dome behind the scene's terrain. */
export function Sky() {
  return <mesh renderOrder={1} frustumCulled={false}>
    <sphereGeometry args={[700, 32, 16]} />
    <shaderMaterial side={BackSide} depthWrite={false} fog={false} toneMapped={false}
      vertexShader={domeVertex} fragmentShader={domeFragment} />
  </mesh>;
}

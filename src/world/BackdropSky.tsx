import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, type Mesh, type Texture } from 'three';
import { BACKDROP_TURN } from './backdropConst';

/** The painted dawn as a sky sphere that follows the camera (not scene.background, which would make three build a cube render target
 * of it). Equirect lookup identical to three's (u = atan(z, x) / 2pi + .5, v = asin(y) / pi + .5), plus the sun turn. The texture is
 * sRGB, so the sampler returns linear and colorspace_fragment encodes it again: display-referred, untoned, unfogged, drawn after the
 * opaque scene with its depth pinned to the far plane. The mip level uses the seam-corrected derivative so there is no line at u = 0. */
const vertex = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.);
  gl_Position.z = gl_Position.w;
}`;
const fragment = /* glsl */`
varying vec3 vDir;
uniform sampler2D uMap;
uniform float uTurn;
void main() {
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.z, d.x) * .15915494 + .5 + uTurn * .15915494, asin(clamp(d.y, -1., 1.)) * .31830989 + .5);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  dx.x -= floor(dx.x + .5); dy.x -= floor(dy.x + .5);
  uv.x = fract(uv.x);   // the turn can push u past 1: wrap, never clamp
  gl_FragColor = vec4(textureGrad(uMap, uv, dx, dy).rgb, 1.);
  #include <colorspace_fragment>
}`;
export default function BackdropSky({ map }: { map: Texture }) {
  const mesh = useRef<Mesh>(null);
  const uniforms = useMemo(() => ({ uMap: { value: map }, uTurn: { value: BACKDROP_TURN } }), [map]);
  useFrame(({ camera }) => { mesh.current?.position.copy(camera.position); });
  return <mesh ref={mesh} renderOrder={1} frustumCulled={false}>
    <sphereGeometry args={[600, 48, 24]} />
    <shaderMaterial side={BackSide} depthWrite={false} fog={false} toneMapped={false} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} />
  </mesh>;
}

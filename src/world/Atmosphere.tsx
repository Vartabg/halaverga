import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, type Mesh, Vector2 } from 'three';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { atmosphere } from './atmospherePalette';
import { skyRadiance, skyUniforms } from './skyShader';
import { waterFragment } from './waterShader';
const vertex = `varying vec3 vWorld; void main(){ vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world;}`;
export function Sky() {
  const dome = useRef<Mesh>(null), uniforms = useMemo(skyUniforms, []);
  useFrame(({ camera }, dt) => {
    // Follow the view without writing to the camera or introducing sky parallax.
    dome.current?.position.copy(camera.position);
    if (!useGame.getState().paused && !useGame.getState().reduced) uniforms.time.value += Math.min(dt,.04);
  });
  return <mesh ref={dome} frustumCulled={false} renderOrder={-1}>
    <sphereGeometry args={[600, 32, 16]} />
    <shaderMaterial side={BackSide} depthWrite={false} uniforms={uniforms}
      vertexShader={`varying vec3 vDirection;void main(){vDirection=position;
        vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`}
      fragmentShader={`${skyRadiance}
        varying vec3 vDirection;
        void main(){gl_FragColor=vec4(skyRadiance(normalize(vDirection)),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`} />
  </mesh>;
}
export function Water() {
  const uniforms = useMemo(() => ({ ...skyUniforms(),
    waterColor: { value: new Color(atmosphere.water) }, siltColor: { value: new Color(atmosphere.silt) },
    wake: { value: new Vector2() }, wakeStrength: { value: 0 },
  }), []);
  useFrame((_, dt) => {
    const state=useGame.getState();
    if (state.paused) return;
    if (!state.reduced) uniforms.time.value += Math.min(dt,.04);
    uniforms.wake.value.set(runtime.position.x,runtime.position.z);
    uniforms.wakeStrength.value = state.reduced ? 0 : Math.exp(-Math.max(0,runtime.position.y-2)*.65)*Math.min(1,runtime.speed/10);
  });
  return <mesh rotation={[-Math.PI/2,0,0]} position={[0,.1,-40]}>
    <planeGeometry args={[1800,1800]} />
    <shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={waterFragment} />
  </mesh>;
}

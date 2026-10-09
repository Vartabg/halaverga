import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, ShaderMaterial, Vector2 } from 'three';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import CanalReflection from './CanalReflection';
import { productionSky } from './productionSky';
import { STORM_HAZE } from './weather';
const vertex = `varying vec3 vWorld; void main(){ vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world;}`;
export function Sky() {
  const uniforms = useMemo(() => ({ haze: { value: new Color(STORM_HAZE) } }), []);
  return <mesh frustumCulled={false}><sphereGeometry args={[700, 32, 16]} /><shaderMaterial side={BackSide} depthWrite={false}
    uniforms={uniforms} vertexShader={`varying vec3 vDirection;
      void main(){vDirection=position;vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
      gl_Position=clip.xyww;}`} fragmentShader={productionSky}/></mesh>;
}
export function Water() {
  const quality = useGame(s => s.quality);
  return quality === 'high' ? <CanalReflection /> : <AnalyticWater />;
}
function AnalyticWater() {
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ time: { value: 0 }, haze: { value: new Color(STORM_HAZE) }, wake: { value: new Vector2() }, wakeStrength: { value: 0 } }), []);
  useFrame((_, dt) => {
    if (material.current && !useGame.getState().paused) {
      if (!useGame.getState().reduced) material.current.uniforms.time.value += Math.min(dt, .04);
      uniforms.wake.value.set(runtime.position.x, runtime.position.z);
      uniforms.wakeStrength.value = useGame.getState().reduced ? 0 : Math.exp(-Math.max(0, runtime.position.y - 2) * .65) * Math.min(1, runtime.speed / 10);
    }
  });
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .1, -40]}>
    <planeGeometry args={[2400, 2400]} />
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={`
      varying vec3 vWorld; uniform float time; uniform vec3 haze; uniform vec2 wake; uniform float wakeStrength;
      void main(){vec2 p=vWorld.xz;
      float a=p.x*.9+p.y*1.7+time*.6+sin(p.y*.37), b=p.x*2.4-p.y*.8-time*.9+sin(p.x*.42);
      float c=p.x*5.3+p.y*3.2+time*.8;
      vec3 n=normalize(vec3(cos(a)*.045+cos(b)*.028,1.,sin(a)*.04+sin(c)*.022));
      vec3 view=normalize(cameraPosition-vWorld), reflected=reflect(-view,n);
      float fresnel=.025+.65*pow(1.-max(dot(n,view),0.),4.);
      vec3 sky=mix(haze,vec3(.055,.07,.086),pow(max(0.,reflected.y),.5));
      vec3 color=mix(vec3(.013,.043,.045),sky,fresnel);
      float d=distance(cameraPosition,vWorld);
      color+=vec3(.005,.012,.008)*sin(a)*sin(b);
      float wd=length(p-wake);color+=vec3(.15,.33,.26)*wakeStrength*exp(-wd*.28)*pow(max(0.,sin(wd*5.-time*7.)),6.);
      color=mix(color,haze,smoothstep(70.,340.,d));
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }
    `}/>
  </mesh>;
}

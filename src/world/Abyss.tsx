import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { UniformsLib, UniformsUtils } from 'three';
import { useGame } from '@/game/store';

/** The abyss has neither roads nor a seaside horizon: black glass cut by fire, with linear fog shared by the sanctuary. */
export default function Abyss() {
  const uniforms = useMemo(() => UniformsUtils.merge([UniformsLib.fog, { time: { value: 0 } }]), []);
  useFrame((_, dt) => { const s = useGame.getState(); if (!s.paused && !s.reduced) uniforms.time.value += Math.min(dt, .04); });
  return <mesh position={[0, .1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[2400, 2400]} />
    <shaderMaterial fog uniforms={uniforms} vertexShader={`varying vec2 vWorld;
      #include <fog_pars_vertex>
      void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xz;vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`} fragmentShader={`varying vec2 vWorld;uniform float time;
      #include <fog_pars_fragment>
      void main(){vec2 p=vWorld*.1;float a=sin(p.x+sin(p.y*.8)*2.);float b=sin(p.y*.7+sin(p.x*1.4));
      float vein=pow(max(0.,1.-abs(a*b)),42.);float nearFire=exp(-abs(vWorld.x)*.012)*(.65+.35*sin(p.y+time*.23));
      vec3 c=vec3(.008,.016,.021)+vec3(.48,.065,.012)*vein*nearFire;
      gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`} />
  </mesh>;
}

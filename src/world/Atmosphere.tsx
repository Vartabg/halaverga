import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, ShaderMaterial, Vector3, Vector2 } from 'three';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
const vertex = `varying vec3 vWorld; void main(){ vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world;}`;
export function Sky() {
  const uniforms = useMemo(() => ({ sun: { value: new Vector3(-.48, .25, -.83).normalize() } }), []);
  return <mesh><sphereGeometry args={[700, 32, 16]} /><shaderMaterial side={BackSide} depthWrite={false}
    uniforms={uniforms} vertexShader={vertex.replace('gl_Position=projectionMatrix*viewMatrix*world;', 'gl_Position=projectionMatrix*viewMatrix*world; gl_Position.z=gl_Position.w;')} fragmentShader={`
    varying vec3 vWorld; uniform vec3 sun;
    void main(){vec3 dir=normalize(vWorld);float h=clamp(dir.y,0.,1.);
    vec3 color=mix(vec3(.63,.43,.30),vec3(.08,.20,.26),pow(h,.55));
    float s=dot(dir,sun);color+=vec3(.3,.20,.09)*pow(max(s,0.),20.);
    color=mix(color,vec3(1.,.91,.67),smoothstep(.996,.997,s));
    float cloud=sin(dir.x*21.+dir.z*14.)*sin(dir.z*38.-dir.x*5.);
    color+=vec3(.075)*smoothstep(.35,.8,cloud)*smoothstep(.12,.22,h)*(1.-smoothstep(.25,.4,h));
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`}/></mesh>;
}
export function Water() {
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ time: { value: 0 }, tint: { value: new Color('#146773') }, wake: { value: new Vector2() }, wakeStrength: { value: 0 } }), []);
  useFrame((_, dt) => {
    if (material.current && !useGame.getState().paused) {
      material.current.uniforms.time.value += Math.min(dt, .04);
      uniforms.wake.value.set(runtime.position.x, runtime.position.z);
      uniforms.wakeStrength.value = Math.exp(-Math.max(0, runtime.position.y - 2) * .65) * Math.min(1, runtime.speed / 10);
    }
  });
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .1, -40]}>
    <planeGeometry args={[1100, 1100]} />
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={`
      varying vec3 vWorld; uniform float time; uniform vec3 tint; uniform vec2 wake; uniform float wakeStrength;
      void main(){vec2 p=vWorld.xz;float wave=sin(p.y*1.8+sin(p.x*.23+time*.15)*2.-time*.8)+.3*sin(p.y*5.1-p.x*.15-time*.4);
      float line=smoothstep(1.08,1.22,wave);float fleck=smoothstep(-.1,.8,sin(p.x*.32+p.y*.14));
      float d=distance(cameraPosition,vWorld);float reflected=exp(-pow((p.x+38.)/35.,2.));
      vec3 color=mix(vec3(.027,.20,.23),tint*1.7,.45+wave*.11);
      color+=line*vec3(.2,.34,.30)*(.25+fleck*.75);
      color+=reflected*line*vec3(.22,.17,.08);
      float wd=length(p-wake);color+=vec3(.15,.33,.26)*wakeStrength*exp(-wd*.28)*pow(max(0.,sin(wd*5.-time*7.)),6.);
      color=mix(color,vec3(.66,.62,.55),smoothstep(110.,360.,d));
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }
    `}/>
  </mesh>;
}

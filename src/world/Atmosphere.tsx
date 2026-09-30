import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, ShaderMaterial, Vector3, Vector2 } from 'three';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
const vertex = `varying vec3 vWorld; void main(){ vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world;}`;
export function Sky() {
  const uniforms = useMemo(() => ({ sun: { value: new Vector3(-65, 100, 80).normalize() } }), []);
  return <mesh><sphereGeometry args={[700, 32, 16]} /><shaderMaterial side={BackSide} depthWrite={false}
    uniforms={uniforms} vertexShader={vertex.replace('gl_Position=projectionMatrix*viewMatrix*world;', 'gl_Position=projectionMatrix*viewMatrix*world; gl_Position.z=gl_Position.w;')} fragmentShader={`
    varying vec3 vWorld; uniform vec3 sun;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
    void main(){vec3 dir=normalize(vWorld);float h=clamp(dir.y,0.,1.);
    vec3 color=mix(vec3(.63,.73,.72),vec3(.12,.38,.57),pow(h,.55));
    float s=dot(dir,sun);color+=vec3(.24,.16,.06)*pow(max(s,0.),18.);
    color=mix(color,vec3(4.,3.4,2.3),smoothstep(.9996,.9998,s));
    vec2 p=dir.xz/max(.15,dir.y)*2.;
    float cloud=noise(p)*.55+noise(p*2.1)*.28+noise(p*4.2)*.13;
    color=mix(color,vec3(.89,.88,.79),smoothstep(.54,.72,cloud)*smoothstep(.06,.2,h)*.65);
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
      void main(){vec2 p=vWorld.xz;
      float a=p.x*.9+p.y*1.7+time*.6+sin(p.y*.37), b=p.x*2.4-p.y*.8-time*.9+sin(p.x*.42);
      float c=p.x*5.3+p.y*3.2+time*.8;
      vec3 n=normalize(vec3(cos(a)*.045+cos(b)*.028,1.,sin(a)*.04+sin(c)*.022));
      vec3 view=normalize(cameraPosition-vWorld), reflected=reflect(-view,n);
      float fresnel=.025+.65*pow(1.-max(dot(n,view),0.),4.);
      vec3 sky=mix(vec3(.56,.69,.65),vec3(.14,.4,.55),pow(max(0.,reflected.y),.5));
      vec3 color=mix(vec3(.018,.16,.145),sky,fresnel);
      float sun=pow(max(dot(reflected,normalize(vec3(-65.,100.,80.))),0.),500.);
      color+=sun*vec3(2.2,1.8,1.1);
      float d=distance(cameraPosition,vWorld);
      color+=vec3(.005,.012,.008)*sin(a)*sin(b);
      float wd=length(p-wake);color+=vec3(.15,.33,.26)*wakeStrength*exp(-wd*.28)*pow(max(0.,sin(wd*5.-time*7.)),6.);
      color=mix(color,vec3(.4,.53,.49),smoothstep(110.,360.,d));
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }
    `}/>
  </mesh>;
}

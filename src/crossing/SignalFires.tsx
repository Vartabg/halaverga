import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Group, ShaderMaterial } from 'three';
import { makeCamp } from './campGeometry';
import type { WalkSurface } from './crossingSurface';
import type { Crossing } from './flight';
import { CAMP_FIRE, SPAN_FIRE } from './signalSites';
import { FIRST_FIRE, VALLEY_REPLY } from './warning';

const vertex = `varying vec2 vUv;
void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const flames = `varying vec2 vUv;
uniform float uTime;
float tongue(vec2 p, float seed) {
  float y=clamp(p.y,0.,1.);
  float tip=sin(y*9.-uTime*4.+seed)*.2*y+sin(y*17.-uTime*3.1+seed)*.12*y;
  float ripple=.8+.2*sin(y*19.-uTime*6.+seed);
  float width=pow(1.-y,.78)*(.31+.63*sin(min(y*4.,1.57)))*ripple;
  float d=abs(p.x-tip)/max(.004,width);
  return (1.-smoothstep(.16,1.,d))*smoothstep(0.,.08,p.y)*(1.-smoothstep(.72,1.,p.y));
}
void main() {
  vec2 p=vec2((vUv.x-.5)*3.,vUv.y);
  float l=tongue(vec2((p.x+.44+p.y*.20)*2.1,p.y*1.36),1.);
  float m=tongue(vec2((p.x-.09-p.y*.17)*2.4,p.y*(1.02+.055*sin(uTime*3.))),4.);
  float r=tongue(vec2((p.x-.39+p.y*.32)*2.9,p.y*1.63),6.);
  float density=max(l,max(m,r));
  if(density<.005)discard;
  float heart=tongue(vec2(p.x*3.4,p.y*1.85),.2)*density;
  vec3 color=mix(vec3(.68,.047,.004),vec3(1.,.37,.018),density);
  color=mix(color,vec3(1.,.86,.36),heart);
  gl_FragColor=vec4(color,density);
  #include <colorspace_fragment>
}`;
const smoke = `varying vec2 vUv;
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
void main() {
  float y=vUv.y;
  float eddy=noise(vec2(y*3.1,uTime*.26));
  float center=.25+.33*y*y+(eddy-.5)*(.02+.19*y);
  float width=.022+.28*pow(y,.8);
  float body=1.-smoothstep(.25,1.,abs(vUv.x-center)/width);
  float wisps=noise(vec2(vUv.x*9.,y*7.-uTime*.55))*.65+noise(vec2(vUv.x*20.,y*15.-uTime*.7))*.35;
  float alpha=body*(.28+.72*wisps)*(1.-smoothstep(.52,1.,y))*smoothstep(0.,.035,y);
  gl_FragColor=vec4(mix(vec3(.072,.06,.058),vec3(.34,.30,.27),y),alpha*.89);
  #include <colorspace_fragment>
}`;

type Props = { flight: Crossing; reduced: boolean; surface: WalkSurface };
function Signal({ flight, reduced, surface, valley }: Props & { valley: boolean }) {
  const fire = useRef<Group>(null), plume = useRef<Group>(null);
  const site = valley ? CAMP_FIRE : SPAN_FIRE, y = surface(site.x, site.z);
  const size = valley ? 1.04 : .72;
  const materials = useMemo(() => [smoke, flames].map(fragmentShader => new ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, vertexShader: vertex, fragmentShader,
    transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
  })), []);
  useEffect(() => () => materials.forEach(material => material.dispose()), [materials]);
  useFrame(({ camera }) => {
    if (!fire.current || !plume.current) return;
    const age = flight.after - (valley ? VALLEY_REPLY : FIRST_FIRE);
    fire.current.visible = flight.phase === 'safe' && age > 0;
    if (!fire.current.visible) return;
    const strength = reduced ? 1 : Math.min(1, .16 + age * 2.4);
    const t = reduced ? 1.8 : age;
    plume.current.rotation.y = Math.atan2(camera.position.x - site.x, camera.position.z - site.z);
    fire.current.scale.set(size, size * strength, size);
    for (const material of materials) material.uniforms.uTime.value = t;
  });
  return <group position={[site.x, y + .06, site.z]} ref={fire} visible={false}>
    <group ref={plume}>
      <mesh position={[1.2, 3.9, 0]} material={materials[0]}><planeGeometry args={[5, 7]} /></mesh>
      <mesh position={[0, 1.19, .08]} material={materials[1]} renderOrder={2}><planeGeometry args={[2.6, 2.2]} /></mesh>
    </group>
  </group>;
}

export default function SignalFires(props: Props) {
  const camp = useMemo(() => makeCamp(props.surface), [props.surface]);
  useEffect(() => () => camp.dispose(), [camp]);
  return <>
    <mesh geometry={camp}><meshStandardMaterial vertexColors roughness={1} side={DoubleSide} /></mesh>
    <Signal {...props} valley={false} /><Signal {...props} valley />
  </>;
}

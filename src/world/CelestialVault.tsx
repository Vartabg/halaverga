import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, DoubleSide, Mesh, ShaderMaterial } from 'three';
import { sealedGround } from './BreachAftermath';
import { useGame } from '@/game/store';
import { battle } from '@/game/celestialBattle';

const vertex = `varying vec3 vDir; void main(){vDir=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=p.xyww;}`;
const fragment = `varying vec3 vDir;
void main(){
  vec3 d=normalize(vDir); float h=max(d.y,0.);
  float w=sin(d.x*9.+sin(d.z*7.)*1.6+d.y*12.);
  float cloud=sin(d.x*22.+d.z*8.+sin(d.y*14.))*sin(d.z*17.-d.x*5.);
  vec3 c=mix(vec3(.019,.034,.047),vec3(.004,.008,.018),smoothstep(0.,.75,h));
  c+=vec3(.003,.004,.006)*cloud*(.3+.7*h);
  vec3 gate=normalize(vec3(0.,.3,-1.));float light=pow(max(dot(d,gate),0.),22.);
  c+=vec3(.06,.04,.014)*light*(.8+.2*w);
  float stars=pow(max(0.,sin(d.x*223.)*sin(d.z*271.)*sin(d.y*197.)),36.);
  c+=vec3(.22,.26,.3)*stars*smoothstep(.25,.65,h);
  gl_FragColor=vec4(c,1.);#include <colorspace_fragment>
}`.replace(';#include', ';\n#include');

/** Architecture supplies the light; the vault is a storm-dark heaven, not a sunlit terrestrial sky. */
export default function CelestialVault() {
  const veil = useRef<ShaderMaterial>(null), crown = useRef<Mesh>(null);
  useFrame((_, dt) => {
    const { paused, reduced } = useGame.getState();
    if (crown.current && !paused && !reduced) crown.current.rotation.z += Math.min(dt, .04) * .025;
    if (veil.current) { veil.current.uniforms.uWon.value = battle.status === 'victory' ? 1 : sealedGround.count * .22;
      if (!paused && !reduced) veil.current.uniforms.time.value += Math.min(dt, .04); }
  });
  return <group>
    <mesh frustumCulled={false} renderOrder={1}>
      <sphereGeometry args={[700, 24, 12]} /><shaderMaterial side={BackSide} depthWrite={false} toneMapped={false} vertexShader={vertex} fragmentShader={fragment} />
    </mesh>
    {/* A gate of light, not a portrait of God. The encounter seals its crimson breach. */}
    <mesh position={[0, 34, -148]}>
      <circleGeometry args={[29, 80]} />
      <shaderMaterial ref={veil} side={DoubleSide} transparent depthWrite={false} toneMapped={false}
        uniforms={{ uWon: { value: 0 }, time: { value: 0 } }} vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`varying vec2 vUv;uniform float uWon;uniform float time;
          void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float angle=atan(p.y,p.x);
          float spiral=pow(.5+.5*sin(angle*9.-r*24.+time*.34+sin(angle*3.+r*8.)),7.);
          float corona=smoothstep(.55,1.,r)*spiral;float edge=pow(r,12.);
          float fissure=exp(-abs(p.x+sin(p.y*9.)*.035)*75.);
          vec3 fire=mix(vec3(.55,.055,.009),vec3(.9,.65,.23),uWon);
          vec3 c=vec3(.008,.012,.019)+fire*(corona*.8+edge*.8+fissure*.6);
          gl_FragColor=vec4(c,(1.-smoothstep(.97,1.,r))*.94);}`} />
    </mesh>
    <mesh ref={crown} position={[0, 69, -210]} rotation={[0, 0, .1]}>
      <torusGeometry args={[55, .16, 5, 160]} /><meshBasicMaterial color="#ceb36d" transparent opacity={.55} fog toneMapped={false} />
    </mesh>
    <mesh position={[0, 69, -210]}>
      <torusGeometry args={[59, .08, 5, 160]} /><meshBasicMaterial color="#a89364" transparent opacity={.35} fog toneMapped={false} />
    </mesh>
  </group>;
}

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Matrix4, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { STORM_HAZE } from './weather';

/** One bounded reflection pass in high quality; low quality keeps the analytic water. */
export default function CanalReflection() {
  const gl = useThree(state => state.gl);
  const water = useMemo(() => {
    const geometry = new PlaneGeometry(2400, 2400);
    const reflector = new Reflector(geometry, { textureWidth: 512, textureHeight: 512,
      multisample: 0, clipBias: .003, shader: {
        name: 'MeridianWater', uniforms: { color: { value: null }, tDiffuse: { value: null }, haze: { value: new Color(STORM_HAZE) },
          textureMatrix: { value: new Matrix4() }, time: { value: 0 }, wake: { value: new Vector2() }, strength: { value: 0 } },
        vertexShader: `uniform mat4 textureMatrix; varying vec4 reflection; varying vec3 world;
          void main(){world=(modelMatrix*vec4(position,1.)).xyz;reflection=textureMatrix*vec4(position,1.);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec2 wake; uniform float strength; uniform vec3 haze;
          varying vec4 reflection; varying vec3 world;
          void main(){vec2 p=world.xz;
            float a=p.x*.47+p.y*.81+time*.48+sin(p.y*.2), b=p.x*1.3-p.y*.51-time*.61;
            vec2 ripple=vec2(sin(a)+sin(b)*.4,cos(a*.8)+sin(b*.7)*.35);
            vec2 uv=reflection.xy/reflection.w+ripple*.0018;
            vec3 mirror=texture2D(tDiffuse,uv).rgb;
            vec3 n=normalize(vec3(ripple.x*.035,1.,ripple.y*.035));
            vec3 view=normalize(cameraPosition-world);
            float fresnel=.06+.78*pow(1.-max(dot(n,view),0.),3.);
            vec3 color=mix(vec3(.012,.055,.058),mirror*.86,fresnel);
            float d=length(p-wake);
            color+=vec3(.12,.24,.21)*strength*exp(-d*.28)*pow(max(0.,sin(d*5.-time*7.)),6.);
            color=mix(color,haze,smoothstep(70.,340.,distance(world,cameraPosition)));
            gl_FragColor=vec4(color,1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      } });
    reflector.rotation.x = -Math.PI / 2; reflector.position.set(0, .1, -40);
    return reflector;
  }, []);
  // Count the reflection and main pass together; reset after CameraRig samples the preceding frame.
  useEffect(() => {
    const previous = gl.info.autoReset; gl.info.autoReset = false;
    return () => { gl.info.autoReset = previous; };
  }, [gl]);
  useFrame(() => gl.info.reset(), -9);
  useFrame((_, dt) => {
    const state = useGame.getState();
    if (state.paused) return;
    const u = (water.material as ShaderMaterial).uniforms;
    if (!state.reduced) u.time.value += Math.min(dt, .04);
    u.wake.value.set(runtime.position.x, runtime.position.z);
    u.strength.value = state.reduced ? 0 : Math.exp(-Math.max(0, runtime.position.y - 2) * .65) * Math.min(1, runtime.speed / 10);
  });
  useEffect(() => () => { water.geometry.dispose(); water.dispose(); }, [water]);
  return <primitive object={water} dispose={null} />;
}

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial, Vector3 } from 'three';
import { mulberry32 } from '@/game/combat';
import { useGame } from '@/game/store';
import { ASH } from './atmospherePalette';

/** Ash still falling eighty years on: flakes in a box around the camera that wraps as you fly (the vertex shader folds every flake
 * back into the box, so nothing is ever moved on the CPU and the field never runs out). Seeded, one draw call, no texture: each flake
 * is a soft round point that fades in from the lens and out into the haze. The fall and drift run on a clock that stops while paused
 * and under reduced motion, so the flakes then hang still. */
export const ashVertex = /* glsl */`
uniform vec3 uCam;
uniform float uTime;
uniform float uSize;
uniform float uBox;
attribute float aSeed;
varying float vFade;
void main() {
  vec3 p = position * uBox;
  p.y -= uTime * (${ASH.fall[0].toFixed(2)} + aSeed * ${(ASH.fall[1] - ASH.fall[0]).toFixed(2)});
  p.x += uTime * ${ASH.wind[0].toFixed(2)} + sin(uTime * .37 + aSeed * 40.) * 1.2;
  p.z += uTime * ${ASH.wind[1].toFixed(2)} + cos(uTime * .29 + aSeed * 57.) * 1.2;
  p = mod(p - uCam + uBox * .5, uBox) + uCam - uBox * .5;
  vec4 mv = viewMatrix * vec4(p, 1.);
  float dist = -mv.z;
  vFade = smoothstep(2., 6., dist) * (1. - smoothstep(uBox * .3, uBox * .48, length(p - uCam)));
  gl_PointSize = uSize * (.6 + aSeed * .8) / max(dist, .1);
  gl_Position = projectionMatrix * mv;
}`;
export const ashFragment = /* glsl */`
uniform vec3 uColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - .5;
  float a = (1. - smoothstep(.2, .5, length(c))) * vFade * ${ASH.alpha.toFixed(2)};
  if (a < .01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

/** Flake positions in the unit cube and a per-flake seed (speed, size, sway phase). */
export function makeAsh(count: number, seed = 2033) {
  const rng = mulberry32(seed), position = new Float32Array(count * 3), flake = new Float32Array(count);
  for (let i = 0; i < count; i++) { position.set([rng(), rng(), rng()], i * 3); flake[i] = rng(); }
  return { position, flake };
}

export default function Ash() {
  const quality = useGame(s => s.quality), gl = useThree(s => s.gl);
  const geometry = useMemo(() => {
    const { position, flake } = makeAsh(quality === 'high' ? ASH.count.high : ASH.count.low), g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(position, 3)); g.setAttribute('aSeed', new Float32BufferAttribute(flake, 1));
    return g;
  }, [quality]);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: { uCam: { value: new Vector3() }, uTime: { value: 0 }, uSize: { value: ASH.size }, uBox: { value: ASH.box }, uColor: { value: new Color(ASH.color) } },
    vertexShader: ashVertex, fragmentShader: ashFragment, transparent: true, depthWrite: false,
  }), []);
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ camera }, dt) => {
    const { paused, reduced } = useGame.getState();
    material.uniforms.uCam.value.copy(camera.position);
    material.uniforms.uSize.value = ASH.size * gl.getPixelRatio();
    if (!paused && !reduced) material.uniforms.uTime.value += Math.min(dt, .04);
  });
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}

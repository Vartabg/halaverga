import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, ShaderMaterial } from 'three';
import { shoulderAxis } from './passLandforms';
import { hash2 } from '@/world/massifData';
import type { Crossing } from './flight';
import { passGroundAt } from './passGround';
import { shoulderLift, WIND_END, WIND_START } from './shoulderWind';

function scouredSnow() {
  const count = 152;
  const points = new Float32Array(count * 3), grains = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const random = (k: number) => hash2(i, k, 485);
    const z = WIND_START + 5 + random(1) * (WIND_END - WIND_START - 10);
    const x = shoulderAxis(z) + 1 + random(2) * 7;
    const y = passGroundAt(x, z) + .65 + random(3) * 1.8;
    points.set([x, y, z], i * 3);
    grains.set([random(4), 2.3 + random(5) * 2.2, shoulderLift(x, y + 3, z), .42 + random(6) ** 3 * 2.9], i * 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(points, 3));
  geometry.setAttribute('grain', new BufferAttribute(grains, 4));
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { clock: { value: 0 }, pixels: { value: 800 } },
    vertexShader: `
      uniform float clock, pixels;
      attribute vec4 grain;
      varying float opacity;
      void main() {
        float t = fract(grain.x + clock / grain.y), seconds = t * grain.y;
        vec3 p = position + vec3(-1.65 * seconds * (1. + .22 * seconds),
          grain.z * seconds + .32 * sin(t * 5. + grain.x * 13.), -.65 * seconds);
        vec4 eye = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * eye;
        gl_PointSize = clamp(grain.w * pixels * projectionMatrix[1][1] / max(1., -eye.z), 1., 48.);
        opacity = smoothstep(0., .16, t) * (1. - smoothstep(.58, 1., t)) * min(1., grain.z / 1.6);
      }`,
    fragmentShader: `
      varying float opacity;
      void main() {
        vec2 q = gl_PointCoord - .5;
        q.y = (q.y - q.x * .22) * 3.1;
        float fade = 1. - smoothstep(.07, .5, length(q));
        gl_FragColor = vec4(.87, .89, .9, fade * opacity * .43);
        #include <colorspace_fragment>
      }`,
  });
  return { geometry, material };
}

export default function CrossingSpindrift({ flight, reduced }: { flight: Crossing; reduced: boolean }) {
  const { geometry, material } = useMemo(scouredSnow, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ size, gl }) => {
    material.uniforms.clock.value = reduced ? 0 : flight.elapsed + flight.after;
    material.uniforms.pixels.value = size.height * .5 * gl.getPixelRatio();
  });
  return <points name="spindrift rising off the shoulder" geometry={geometry} material={material} frustumCulled={false} dispose={null} />;
}

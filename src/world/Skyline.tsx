import { useEffect, useMemo } from 'react';
import { MeshBasicMaterial } from 'three';
import { HAZE, SEA_BODY, SKY, SKYLINE, glslRgb, glslVec3 } from './atmospherePalette';
import { makeSkyline } from './skylineData';

/** Colours the foot mist and the snow band need. */
const prefix = /* glsl */`
varying vec3 vSky;
const vec3 FOOT_SEA = ${glslRgb(SEA_BODY)};
const vec3 FOOT_HAZE = ${glslVec3(HAZE)};
const vec3 FOOT_LOW = ${glslVec3(SKY.low)};
const vec3 SNOW = ${glslVec3(SKYLINE.foam)};
`;

/** Display-referred vertex colour and scene fog. The foot mists toward the water in front of it, with a dark contact line and a
 * band of snow. No window grid: these are stone ranges, not towers. The haze takes every peak by the fog's far end.
 * `transformed` is world space because the mesh sits at the origin. No loops. */
export function skylineMaterial() {
  const material = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vSky;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSky = transformed;');
    shader.fragmentShader = prefix + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float yy = max(vSky.y - .1, 0.);
      diffuseColor.rgb *= 1. - .45 * (1. - smoothstep(.2, 3., yy)) * vec3(.85, .8, .9);
      vec3 toBase = cameraPosition - vec3(vSky.x, .1, vSky.z);
      float cosI = clamp(toBase.y / length(toBase), 0., 1.);
      vec3 sea = mix(FOOT_SEA, mix(FOOT_HAZE, FOOT_LOW, smoothstep(0., .17, cosI)), min(.025 + .55 * pow(1. - cosI, 4.), .8));
      diffuseColor.rgb = mix(diffuseColor.rgb, sea, exp(-yy * .25) * .7);
      diffuseColor.rgb = mix(diffuseColor.rgb, SNOW, (1. - smoothstep(.05, .7, yy)) * .45);
      diffuseColor.rgb *= .84 + .16 * smoothstep(2., 60., yy);`)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
      float f = smoothstep(fogNear, fogFar, vFogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, mix(f, pow(f, 1.3), smoothstep(.5, 14., vSky.y)));
      #endif`);
  };
  return material;
}

/** The distant ruins: one static mesh, one draw call, outside the flyable box, no collider, no shadow, nothing per frame. Built
 * and disposed with the Scene, which remounts after a context loss. */
export default function Skyline() {
  const sky = useMemo(makeSkyline, []), material = useMemo(skylineMaterial, []);
  useEffect(() => () => { sky.geometry.dispose(); material.dispose(); }, [sky, material]);
  return <mesh geometry={sky.geometry} material={material} frustumCulled={false} castShadow={false} receiveShadow={false} dispose={null} />;
}

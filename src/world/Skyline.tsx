import { useEffect, useMemo } from 'react';
import { MeshBasicMaterial } from 'three';
import { HAZE, glslVec3 } from './atmospherePalette';
import { makeSkyline } from './skylineData';

/** Display-referred vertex colour (baked sun-lit and shaded faces) and scene fog for the aerial perspective, plus three small touches
 * that cost a few ALU ops and no texture: a mist that thickens toward the waterline (a misty foot, never a hard dark one), and on
 * vertical faces a faint window grid (3 m bays, 4.5 m floors, found from the face's own derivatives) that fades out with distance and
 * before it gets finer than a pixel, so near towers read as buildings and far ones stay calm. `transformed` is world space because
 * the mesh sits at the origin. No loops. */
export function skylineMaterial() {
  const material = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vSky;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSky = transformed;');
    shader.fragmentShader = 'varying vec3 vSky;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, ${glslVec3(HAZE)}, exp(-max(vSky.y + 3., 0.) * .13));
      vec3 face = normalize(cross(dFdx(vSky), dFdy(vSky)));
      vec2 bay = vec2(dot(vSky.xz, vec2(-face.z, face.x)) / 3., vSky.y / 4.5), cell = fract(bay);
      float pane = smoothstep(.1, .22, cell.x) * (1. - smoothstep(.78, .9, cell.x)) * smoothstep(.2, .34, cell.y) * (1. - smoothstep(.62, .78, cell.y));
      float walls = 1. - smoothstep(.3, .6, abs(face.y)), fine = 1. - smoothstep(.3, .7, max(fwidth(bay.x), fwidth(bay.y)));
      #ifdef USE_FOG
      float near = 1. - smoothstep(300., 520., vFogDepth);
      #else
      float near = 1.;
      #endif
      diffuseColor.rgb *= 1. - .1 * pane * walls * fine * near;`);
  };
  return material;
}

/** The distant skyline: one static mesh, one draw call, outside the flyable box, no collider, no shadow, nothing per frame. Built
 * and disposed with the Scene, which remounts after a context loss. */
export default function Skyline() {
  const sky = useMemo(makeSkyline, []), material = useMemo(skylineMaterial, []);
  useEffect(() => () => { sky.geometry.dispose(); material.dispose(); }, [sky, material]);
  return <mesh geometry={sky.geometry} material={material} frustumCulled={false} castShadow={false} receiveShadow={false} dispose={null} />;
}

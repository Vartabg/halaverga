import { useEffect, useMemo } from 'react';
import { MeshBasicMaterial } from 'three';
import { HAZE, glslVec3 } from './atmospherePalette';
import { makeSkyline } from './skylineData';

/** Display-referred vertex colour (baked sun-lit and shaded faces), scene fog for the aerial perspective, and two small touches: a
 * mist that thickens toward the waterline (a misty foot, never a hard dark one) and faint floor bands that fade out with distance.
 * `transformed.y` is world y because the mesh sits at the origin. No textures, no loops. */
export function skylineMaterial() {
  const material = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying float vSkyY;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkyY = transformed.y;');
    shader.fragmentShader = 'varying float vSkyY;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float above = max(vSkyY + 3., 0.);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${glslVec3(HAZE)}, exp(-above * .13));
      float band = abs(fract(vSkyY / 4.5) - .5) * 2.;
      #ifdef USE_FOG
      float near = 1. - smoothstep(380., 520., vFogDepth);
      #else
      float near = 1.;
      #endif
      diffuseColor.rgb *= 1. - .07 * smoothstep(.35, .65, band) * near;`);
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

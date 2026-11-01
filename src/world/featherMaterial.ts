import { Color, DoubleSide, MeshPhysicalMaterial, Vector2 } from 'three';
import { featherAtlas } from './featherAtlas';

/**
 * The plumage material shared by both skinned wings. Feather outlines come from the atlas alpha with alpha-to-coverage (MSAA
 * smooths the frayed edges; nothing is blended or sorted, so overdraw stays opaque-cheap). A soft sheen catches light along the
 * barbs, and a translucency term lets light through thin vanes: a wing between the viewer and the light glows at its tips and
 * along the trailing edge, as real white plumage does.
 */
export function featherMaterial() {
  const atlas = featherAtlas();
  const material = new MeshPhysicalMaterial({ color: new Color('#f6efe2'), vertexColors: true, roughness: .58, metalness: 0,
    map: atlas.colour, normalMap: atlas.normal, normalScale: new Vector2(.48, .48), alphaTest: .42, alphaToCoverage: true,
    sheen: .45, sheenRoughness: .35, sheenColor: new Color('#fff6e6'), side: DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float aThin;\nvarying float vThin;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvThin = aThin;');
    shader.fragmentShader = 'varying float vThin;\n' + shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      #pragma unroll_loop_start
      for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {{
        vec3 toLight = directionalLights[ i ].direction;
        float behind = saturate( dot( -geometryNormal, toLight ) );
        float facing = pow( saturate( dot( -geometryViewDir, toLight ) ), 3.0 );
        reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[ i ].color * vThin * behind * ( .34 + .62 * facing );
      }}
      #pragma unroll_loop_end
      #endif`).replace('#include <dithering_fragment>', `
      float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.3);
      gl_FragColor.rgb += vec3(0.99, 0.84, 0.52) * smoothstep(0.38, 0.78, fresnel) * 0.24;
      #include <dithering_fragment>`);
  };
  material.customProgramCacheKey = () => 'feather-atlas-dawn-v3';
  return { material, dispose() { material.dispose(); atlas.colour.dispose(); atlas.normal.dispose(); } };
}

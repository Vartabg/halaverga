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
  const material = new MeshPhysicalMaterial({ color: new Color('#f1e9da'), vertexColors: true, roughness: .66, metalness: 0,
    map: atlas.colour, normalMap: atlas.normal, normalScale: new Vector2(.55, .55), alphaTest: .42, alphaToCoverage: true,
    sheen: .4, sheenRoughness: .38, sheenColor: new Color('#fff4e2'), side: DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float aThin;\nvarying float vThin;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvThin = aThin;');
    shader.fragmentShader = 'varying float vThin;\n' + shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      #pragma unroll_loop_start
      for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {{
        vec3 toLight = directionalLights[ i ].direction;
        float behind = saturate( dot( -geometryNormal, toLight ) );
        float facing = pow( saturate( dot( -geometryViewDir, toLight ) ), 3.0 );
        reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[ i ].color * vThin * behind * ( .3 + .6 * facing );
      }}
      #pragma unroll_loop_end
      #endif`).replace('#include <dithering_fragment>', `
      float edgeInk = smoothstep(0.26, 0.62, length(fwidth(vNormal)));
      float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
      gl_FragColor.rgb += vec3(0.99, 0.80, 0.38) * smoothstep(0.45, 0.72, fresnel) * 0.28;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.06, 0.04, 0.10), edgeInk * 0.72);
      #include <dithering_fragment>`);
  };
  material.customProgramCacheKey = () => 'feather-atlas-hades-v2';
  return { material, dispose() { material.dispose(); atlas.colour.dispose(); atlas.normal.dispose(); } };
}

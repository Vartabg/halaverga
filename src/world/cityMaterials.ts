import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2 } from 'three';

const root = '/textures/environment/';
const files = ['concrete_floor_02_diff_1k.jpg', 'concrete_floor_02_nor_gl_1k.jpg',
  'concrete_floor_02_rough_1k.jpg', 'concrete_moss_diff_1k.jpg', 'concrete_moss_nor_gl_1k.jpg'];

export function useCityMaterials() {
  const maps = useLoader(TextureLoader, files.map(f => root + f));
  return useMemo(() => {
    maps.forEach((map, i) => {
      map.wrapS = map.wrapT = RepeatWrapping; map.anisotropy = 4;
      if (i === 0 || i === 3) map.colorSpace = SRGBColorSpace;
    });
    const stone = new MeshStandardMaterial({ vertexColors: true, map: maps[0], normalMap: maps[1],
      roughnessMap: maps[2], roughness: .95, normalScale: new Vector2(.7, .7) });
    // Broad weathering and waterline capillary wetness ground modular structures in world space.
    stone.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vWeather;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvWeather = (modelMatrix * vec4(position, 1.)).xyz;');
      shader.fragmentShader = 'varying vec3 vWeather;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float streak = pow(abs(sin(vWeather.x * 2.91 + vWeather.z * 4.73)), 16.);
        float weather = .84 + .16 * sin(vWeather.y * .22 + vWeather.x * .13 + vWeather.z * .17);
        diffuseColor.rgb *= weather * (1. - streak * .14);
        float waterDist = vWeather.y - .1;
        float wet = smoothstep(2., 0., waterDist);
        float tideAlgae = smoothstep(.9, .05, waterDist) * (.6 + .4 * sin(vWeather.x * 2.3 + vWeather.z * 1.9));
        diffuseColor.rgb *= (1. - wet * .42);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.11, .22, .14), tideAlgae * .7);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        float wWet = smoothstep(2., 0., vWeather.y - .1);
        roughnessFactor = mix(roughnessFactor, .26, wWet * .78);
      `);
    };
    const glass = new MeshStandardMaterial({ vertexColors: true, roughness: .22, metalness: .52, envMapIntensity: 1.6 });
    glass.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.rgb += vec3(.03, .07, .11) * pow(1. - max(dot(geometryNormal, geometryViewDir), 0.), 3.);
      `);
    };
    const metal = new MeshStandardMaterial({ vertexColors: true, roughness: .74, metalness: .35 });
    const ground = new MeshStandardMaterial({ vertexColors: true, map: maps[3], normalMap: maps[4],
      roughness: 1, normalScale: new Vector2(.8, .8) });
    const paint = new MeshStandardMaterial({ vertexColors: true, roughness: .85 });
    return [stone, glass, metal, ground, paint];
  }, [maps]);
}

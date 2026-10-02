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
    /** The concrete texture, weathered in world space so adjoining modular pieces tie together. `calm` takes most of the photo's marbling and warm cast out and
     * adds a wet band at the water line (the district-edge hills and the terrace parapets: a big plain face reads as weathered concrete, not a slab of marble). */
    const concrete = (calm: boolean) => {
      const material = new MeshStandardMaterial({ vertexColors: true, map: maps[0], normalMap: maps[1],
        roughnessMap: maps[2], roughness: .95, normalScale: new Vector2(calm ? .45 : .7, calm ? .45 : .7) });
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'varying vec3 vWeather;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvWeather = (modelMatrix * vec4(position, 1.)).xyz;');
        shader.fragmentShader = 'varying vec3 vWeather;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          ${calm ? 'vec3 tex = diffuseColor.rgb / max(vColor.rgb, vec3(.001)); tex = mix(vec3(dot(tex, vec3(.2126, .7152, .0722))), tex, .3); diffuseColor.rgb = vColor.rgb * mix(vec3(.155), tex, .25);' : ''}
          float streak = pow(abs(sin(vWeather.x * 2.91 + vWeather.z * 4.73)), 16.);
          float weather = .84 + .16 * sin(vWeather.y * .22 + vWeather.x * .13 + vWeather.z * .17);
          diffuseColor.rgb *= weather * (1. - streak * .14);
          ${calm ? 'diffuseColor.rgb *= 1. - .3 * (1. - smoothstep(0., 4., vWeather.y)) * vec3(.9, .55, .7);' : ''}
        `);
      };
      return material;
    };
    const stone = concrete(false), calm = concrete(true);
    const glass = new MeshStandardMaterial({ vertexColors: true, roughness: .26, metalness: .48, envMapIntensity: 1.3 });
    const metal = new MeshStandardMaterial({ vertexColors: true, roughness: .76, metalness: .3 });
    const ground = new MeshStandardMaterial({ vertexColors: true, map: maps[3], normalMap: maps[4],
      roughness: 1, normalScale: new Vector2(.8, .8) });
    const paint = new MeshStandardMaterial({ vertexColors: true, roughness: .85 });
    return [stone, glass, metal, ground, paint, calm];
  }, [maps]);
}

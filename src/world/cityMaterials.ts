import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2 } from 'three';
import { paintInkMaterial } from './paintInk';

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
        roughnessMap: maps[2], roughness: .88, metalness: .22, normalScale: new Vector2(calm ? .55 : .85, calm ? .55 : .85) });
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'varying vec3 vWeather;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvWeather = (modelMatrix * vec4(position, 1.)).xyz;');
        shader.fragmentShader = 'varying vec3 vWeather;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          ${calm ? 'vec3 tex = diffuseColor.rgb / max(vColor.rgb, vec3(.001)); tex = mix(vec3(dot(tex, vec3(.2126, .7152, .0722))), tex, .3); diffuseColor.rgb = vColor.rgb * mix(vec3(.14, .10, .08), tex, .28);' : ''}
          diffuseColor.rgb = mix(diffuseColor.rgb * vec3(.72, .54, .40), vec3(.14, .095, .075), .38);
          float streak = pow(abs(sin(vWeather.x * 2.4 + vWeather.z * 2.4)), 10.);
          float tier = smoothstep(.72, .94, abs(sin(vWeather.y * 1.35)));
          float weather = .82 + .18 * sin(vWeather.y * .22 + vWeather.x * .13 + vWeather.z * .17);
          diffuseColor.rgb *= weather * (1. - streak * .22 - tier * .18);
          // Laid stone of Hermon: course lines cut every ~3 m darken the wall, and first light warms the low courses near the
          // ground, fading with height so only the foot of the wall reads dawn-lit.
          float chisel = pow(abs(sin(vWeather.y * 2.1 + vWeather.x * .13 + vWeather.z * .17)), 2.);
          diffuseColor.rgb *= 1. - .12 * chisel;
          diffuseColor.rgb += vec3(.30, .17, .05) * chisel * (1. - smoothstep(6., 26., vWeather.y));
          ${calm ? 'diffuseColor.rgb *= 1. - .35 * (1. - smoothstep(0., 4., vWeather.y)) * vec3(.5, .75, .85);' : ''}
        `);
      };
      return material;
    };
    const stone = concrete(false), calm = concrete(true);
    // No glass in the days of Jared: this group is dark polished basalt, rough and non-metal, so old glass-mapped faces read as stone.
    const glass = new MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .05, envMapIntensity: .4 });
    glass.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.16, .14, .13), .68);');
    };
    // Worked bronze (Gen 4:22: bronze work is pre-Flood) for crowns and fittings, not steel.
    const metal = new MeshStandardMaterial({ vertexColors: true, roughness: .42, metalness: .76 });
    metal.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.52, .35, .18), .6);');
    };
    const ground = new MeshStandardMaterial({ vertexColors: true, map: maps[3], normalMap: maps[4],
      roughness: .92, metalness: .15, normalScale: new Vector2(.9, .9) });
    // Dark summit rock of Mount Hermon, dawn-lit at the edges.
    ground.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float luma = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
        diffuseColor.rgb = vec3(luma) * vec3(.46, .33, .25);`);
    };
    const paint = new MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: .25 });
    paint.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = vec3(.09, .065, .05);');
    };
    return [stone, glass, metal, ground, paint, calm, paintInkMaterial()];
  }, [maps]);
}

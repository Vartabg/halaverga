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
    /** Hades-inspired Mount Hermon stone: stepped cel bands, deep indigo-violet shadows, bold sumi-ink course & crease lines,
     * and dawn-lit snow/gold crests on upper terraces. */
    const concrete = (calm: boolean) => {
      const material = new MeshStandardMaterial({ vertexColors: true, map: maps[0], normalMap: maps[1],
        roughnessMap: maps[2], roughness: .82, metalness: .16, normalScale: new Vector2(calm ? .35 : .55, calm ? .35 : .55) });
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'varying vec3 vWeather;\nvarying vec3 vWorldN;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWeather = (modelMatrix * vec4(position, 1.)).xyz;\nvWorldN = normalize(mat3(modelMatrix) * objectNormal);',
        );
        shader.fragmentShader = 'varying vec3 vWeather;\nvarying vec3 vWorldN;\n' + shader.fragmentShader
          .replace('#include <color_fragment>', `
            #include <color_fragment>
            vec3 nW = normalize(vWorldN);
            ${calm ? 'vec3 tex = diffuseColor.rgb / max(vColor.rgb, vec3(.001)); tex = mix(vec3(dot(tex, vec3(.2126, .7152, .0722))), tex, .25); diffuseColor.rgb = vColor.rgb * mix(vec3(.24, .21, .32), tex, .22);' : ''}
            diffuseColor.rgb = mix(diffuseColor.rgb * vec3(.78, .72, .88), vec3(.22, .18, .31), .32);
            float coursePhase = fract(vWeather.y * 0.38 + (vWeather.x + vWeather.z) * 0.02);
            float seam = (1.0 - abs(nW.y)) * (1.0 - smoothstep(0.035, 0.075, abs(coursePhase - 0.5)));
            float tierShift = step(0.5, fract(floor(vWeather.y * 0.38) * 0.37 + floor((vWeather.x - vWeather.z) * 0.08) * 0.23));
            diffuseColor.rgb *= mix(0.92, 1.08, tierShift);
            float snowCrest = smoothstep(0.55, 0.85, nW.y) * smoothstep(10.0, 26.0, vWeather.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.91, 0.86, 0.80), snowCrest * 0.62);
            float goldVein = seam * (1.0 - smoothstep(3.0, 24.0, vWeather.y)) * step(0.55, sin(vWeather.x * 0.35 + vWeather.z * 0.29));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.62, 0.26), goldVein * 0.65);
            ${calm ? 'diffuseColor.rgb *= 1. - .28 * (1. - smoothstep(0., 4., vWeather.y)) * vec3(.35, .52, .68);' : ''}
          `)
          .replace('#include <dithering_fragment>', `
            vec3 nEdgeVec = normalize(vWorldN);
            float edgeInk = smoothstep(0.18, 0.44, length(fwidth(nEdgeVec)));
            float courseInk = (1.0 - abs(nEdgeVec.y)) * (1.0 - smoothstep(0.028, 0.062, abs(fract(vWeather.y * 0.38) - 0.5))) * (1.0 - smoothstep(0.18, 0.42, fwidth(vWeather.y * 0.38)));
            float totalInk = clamp(max(edgeInk * 0.94, courseInk * 0.68), 0.0, 1.0);
            float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
            float faceBoost = max(0.0, nEdgeVec.y) * 0.35 + abs(nEdgeVec.x) * 0.22 + max(0.0, nEdgeVec.z) * 0.18;
            float celBand = mix(0.76, 1.18, floor(clamp((lum + faceBoost) * 3.0, 0.0, 2.99)) / 2.0);
            vec3 celCol = mix(vec3(0.24, 0.19, 0.36), gl_FragColor.rgb * celBand, smoothstep(0.04, 0.26, lum + faceBoost));
            float rimCatch = edgeInk * step(0.12, nEdgeVec.y + 0.35 * abs(nEdgeVec.x)) * (1.0 - step(0.74, edgeInk));
            celCol += vec3(0.98, 0.78, 0.38) * rimCatch * 0.56;
            gl_FragColor.rgb = mix(celCol, vec3(0.03, 0.02, 0.06), totalInk);
            #include <dithering_fragment>
          `);
      };
      return material;
    };
    const stone = concrete(false), calm = concrete(true);
    // Polished twilight obsidian-indigo stone with crisp edge ink.
    const glass = new MeshStandardMaterial({ vertexColors: true, roughness: .65, metalness: .18, envMapIntensity: .55 });
    glass.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.16, .13, .25), .68);');
    };
    // Worked Watcher bronze & Covenant gold (Gen 4:22 / 1 Enoch 8:1) with warm ember-gold sheen.
    const metal = new MeshStandardMaterial({ vertexColors: true, roughness: .34, metalness: .82, emissive: '#3a1c06', emissiveIntensity: .38 });
    metal.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.84, .58, .24), .64);');
    };
    const ground = new MeshStandardMaterial({ vertexColors: true, map: maps[3], normalMap: maps[4],
      roughness: .88, metalness: .12, normalScale: new Vector2(.65, .65) });
    // Twilight basalt flagstone & snow-dusted summit banks of Mount Hermon.
    ground.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vGndW;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\nvGndW = (modelMatrix * vec4(position, 1.)).xyz;',
      );
      shader.fragmentShader = 'varying vec3 vGndW;\n' + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float luma = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
        float grid = max(1.0 - smoothstep(0.03, 0.08, abs(fract(vGndW.x * 0.16) - 0.5)), 1.0 - smoothstep(0.03, 0.08, abs(fract(vGndW.z * 0.16) - 0.5)));
        vec3 slate = mix(vec3(.24, .21, .34), vec3(.58, .52, .64), smoothstep(.2, .75, luma));
        float frost = smoothstep(14.0, 21.0, vGndW.y) * smoothstep(0.42, 0.72, luma);
        slate = mix(slate, vec3(.88, .83, .78), frost * 0.55);
        diffuseColor.rgb = mix(slate, vec3(.08, .06, .14), grid * 0.45);`);
    };
    const paint = new MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .35, emissive: '#d98a2b', emissiveIntensity: .65 });
    paint.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.95, .74, .34), .55);');
    };
    return [stone, glass, metal, ground, paint, calm, paintInkMaterial()];
  }, [maps]);
}

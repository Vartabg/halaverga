import { DataTexture, MeshToonMaterial, NearestFilter, NoColorSpace, RedFormat } from 'three';
import { terrainFragment, terrainFragmentPars, type TerrainUniforms } from './terrainArt';

/** Local limestone tones for the carved stone, with gold and ember reserved for the sanctuary markings. */
export const INK = {
  rock: '#81786a', lit: '#f1e4cc', shaft: '#968876', plinth: '#5c5549', crown: '#ffbe42', cap: '#fbf4e8', broken: '#e26444',
  ember: '#f05a38', jade: '#2d7a6e', obsidian: '#181322',
} as const;
/** Material group on the merged city mesh. Appended so the six older groups keep their indexes. */
export const INK_GROUP = 6;
/** How much of the sky fill survives on the paint. The sun still draws the stepped cel bands. */
export const INK_SKY = 0.28;

/** A Hades-style cel-and-ink toon material: 4-band gradient ramp, chromatic indigo shadows, sumi-ink edge/course outlines, and golden rim light. */
/** Painted stone with the real rock and snow maps (terrainArt.ts): `wholeTerrain` for the massif, else only stone colours change. The
 * cel steps and ink soften by tK, so until the maps load (or if a file is missing) it is the plain Hades paint. */
export function paintInkMaterial(terrain: TerrainUniforms, wholeTerrain = false) {
  const gradient = new DataTexture(new Uint8Array([88, 152, 216, 255]), 4, 1, RedFormat);
  gradient.magFilter = NearestFilter;
  gradient.minFilter = NearestFilter;
  gradient.colorSpace = NoColorSpace;
  gradient.needsUpdate = true;
  const material = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient, toneMapped: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vInkW;\nvarying vec3 vInkN;\nvarying vec2 vInkUv;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInkW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvInkN = normalize(mat3(modelMatrix) * objectNormal);\nvInkUv = uv;');
    Object.assign(shader.uniforms, terrain);
    shader.fragmentShader = 'varying vec3 vInkW;\nvarying vec3 vInkN;\nvarying vec2 vInkUv;\n' + terrainFragmentPars
      + shader.fragmentShader.replace('#include <lights_toon_fragment>', `vec3 nW = normalize(vInkN);
${terrainFragment(wholeTerrain)}
#include <lights_toon_fragment>`).replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `reflectedLight.indirectDiffuse *= ${INK_SKY};
        float nEdge = smoothstep(0.16, 0.40, length(fwidth(nW)));
        float uvCrease = step(0.18, vInkUv.y) * step(vInkUv.y, 1.001) * step(-0.001, vInkUv.x) * step(vInkUv.x, 1.001);
        float ridgeLine = (1.0 - smoothstep(0.0, max(fwidth(vInkUv.x) * 1.4, 0.06), vInkUv.x)) * smoothstep(0.18, 0.62, vInkUv.y) * uvCrease;
        float contour = (1.0 - smoothstep(0.0, max(fwidth(vInkW.y) * 1.25, 0.08), abs(fract(vInkW.y / 8.5) - 0.5))) * smoothstep(0.28, 0.78, 1.0 - nW.y) * 0.58;
        float cragSeam = (1.0 - smoothstep(0.0, max(fwidth(vInkW.x + vInkW.z * 0.7) * 1.1, 0.07), abs(fract((vInkW.x + vInkW.z * 0.7) / 14.0) - 0.5))) * smoothstep(0.45, 0.85, 1.0 - nW.y) * 0.46;
        float rawEdge = max(nEdge, max(ridgeLine, max(contour, cragSeam)));
        float inkFade = 1.0 - smoothstep(85.0, 265.0, distance(cameraPosition, vInkW));
        float inkMask = clamp(rawEdge * mix(0.92, 0.4, tK) * inkFade, 0.0, 1.0);
        vec3 baseLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
        float sunFace = max(0.0, nW.y) * 0.62 + max(0.0, -nW.x) * 0.58 + max(0.0, -nW.z) * 0.44;
        float celBand = floor(clamp(sunFace * 3.15, 0.0, 2.99)) / 2.0;
        vec3 shadowCol = diffuseColor.rgb * mix(vec3(0.38, 0.34, 0.29), vec3(0.50, 0.48, 0.44), tK);
        vec3 midCol = diffuseColor.rgb * mix(vec3(0.74, 0.69, 0.61), vec3(0.83, 0.80, 0.74), tK);
        vec3 litCol = mix(diffuseColor.rgb * 1.05, vec3(0.98, 0.88, 0.74), 0.22);
        vec3 celTone = mix(shadowCol, mix(midCol, litCol, clamp(celBand * 2.0 - 1.0, 0.0, 1.0)), clamp(celBand * 2.0, 0.0, 1.0));
        vec3 shaded = mix(baseLight, celTone, mix(0.90, 0.6, tK));
        float snowSlope = smoothstep(0.34, 0.78, nW.y) * smoothstep(32.0, 74.0, vInkW.y) * (0.48 + 0.52 * celBand);
        shaded = mix(shaded, vec3(0.97, 0.92, 0.85), snowSlope * 0.78);
        float chisel = max(nEdge, max(ridgeLine * 0.85, contour * 0.75)) * step(0.08, nW.y + 0.38 * max(0.0, -nW.x)) * (1.0 - step(0.78, rawEdge));
        vec3 rimGold = vec3(0.99, 0.78, 0.36) * (chisel * 0.65 + step(0.68, nW.y) * 0.14);
        vec3 outgoingLight = mix(shaded + rimGold, vec3(0.063, 0.057, 0.048), inkMask);`,
      );
  };
  const key = `paint-ink-hades-v9${wholeTerrain ? '-whole' : ''}`;
  material.customProgramCacheKey = () => key;
  const dispose = material.dispose.bind(material);
  material.dispose = () => { gradient.dispose(); dispose(); };
  return material;
}

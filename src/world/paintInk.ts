import { DataTexture, MeshToonMaterial, NearestFilter, NoColorSpace, RedFormat } from 'three';

/** Hades-inspired mythic palette for Mount Hermon: deep obsidian-indigo shadow stone, warm dawn-gilded limestone, molten covenant gold,
 * crimson-ember bronze, and crisp snow-alabaster crests. */
export const INK = {
  rock: '#63507d', lit: '#f4dec0', shaft: '#8e728b', plinth: '#3e3154', crown: '#ffbe42', cap: '#fbf4e8', broken: '#e26444',
  ember: '#f05a38', jade: '#2d7a6e', obsidian: '#181322',
} as const;
/** Material group on the merged city mesh. Appended so the six older groups keep their indexes. */
export const INK_GROUP = 6;
/** How much of the sky fill survives on the paint. The sun still draws the stepped cel bands. */
export const INK_SKY = 0.28;

/** A Hades-style cel-and-ink toon material: 4-band gradient ramp, chromatic indigo shadows, sumi-ink edge/course outlines, and golden rim light. */
export function paintInkMaterial() {
  const gradient = new DataTexture(new Uint8Array([88, 152, 216, 255]), 4, 1, RedFormat);
  gradient.magFilter = NearestFilter;
  gradient.minFilter = NearestFilter;
  gradient.colorSpace = NoColorSpace;
  gradient.needsUpdate = true;
  const material = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient, toneMapped: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vInkW;\nvarying vec3 vInkN;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInkW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvInkN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = 'varying vec3 vInkW;\nvarying vec3 vInkN;\n'
      + shader.fragmentShader.replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `reflectedLight.indirectDiffuse *= ${INK_SKY};
        vec3 nW = normalize(vInkN);
        float nEdge = smoothstep(0.16, 0.42, length(fwidth(nW)));
        float inkFade = 1.0 - smoothstep(75.0, 215.0, distance(cameraPosition, vInkW));
        float inkMask = clamp(nEdge * 0.88 * inkFade, 0.0, 1.0);
        vec3 baseLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
        float sunFace = max(0.0, nW.y) * 0.65 + max(0.0, -nW.x) * 0.55 + max(0.0, -nW.z) * 0.45;
        float celBand = floor(clamp(sunFace * 3.1, 0.0, 2.99)) / 2.0;
        vec3 shadowCol = diffuseColor.rgb * vec3(0.42, 0.34, 0.58);
        vec3 midCol = diffuseColor.rgb * vec3(0.76, 0.66, 0.82);
        vec3 litCol = mix(diffuseColor.rgb * 1.02, vec3(0.96, 0.86, 0.72), 0.18);
        vec3 celTone = mix(shadowCol, mix(midCol, litCol, clamp(celBand * 2.0 - 1.0, 0.0, 1.0)), clamp(celBand * 2.0, 0.0, 1.0));
        vec3 shaded = mix(baseLight, celTone, 0.88);
        float snowSlope = smoothstep(0.30, 0.76, nW.y) * smoothstep(34.0, 78.0, vInkW.y) * (0.48 + 0.52 * celBand);
        shaded = mix(shaded, vec3(0.96, 0.91, 0.84), snowSlope * 0.74);
        float chisel = nEdge * step(0.08, nW.y + 0.38 * max(0.0, -nW.x)) * (1.0 - step(0.76, nEdge));
        vec3 rimGold = vec3(0.99, 0.78, 0.36) * (chisel * 0.62 + step(0.68, nW.y) * 0.14);
        vec3 outgoingLight = mix(shaded + rimGold, vec3(0.04, 0.03, 0.08), inkMask);`,
      );
  };
  material.customProgramCacheKey = () => 'paint-ink-hades-v6';
  const dispose = material.dispose.bind(material);
  material.dispose = () => { gradient.dispose(); dispose(); };
  return material;
}

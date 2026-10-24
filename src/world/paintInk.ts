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
        float nEdge = smoothstep(0.18, 0.44, length(fwidth(nW)));
        float rowIdx = floor(vInkW.y * 0.42);
        float course = abs(fract(vInkW.y * 0.42) - 0.5);
        float joint = abs(fract((vInkW.x + vInkW.z) * 0.14 + rowIdx * 0.5) - 0.5);
        float wallMask = 1.0 - smoothstep(0.45, 0.75, abs(nW.y));
        float hSeam = wallMask * (1.0 - smoothstep(0.032, 0.068, course)) * (1.0 - smoothstep(0.18, 0.45, fwidth(vInkW.y * 0.42)));
        float vSeam = wallMask * (1.0 - smoothstep(0.018, 0.042, joint)) * (1.0 - smoothstep(0.16, 0.38, fwidth((vInkW.x + vInkW.z) * 0.14)));
        float inkMask = clamp(max(nEdge * 0.96, max(hSeam * 0.78, vSeam * 0.55)), 0.0, 1.0);
        vec3 baseLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
        float faceLight = max(0.0, nW.y) * 0.85 + abs(nW.x) * 0.48 + max(0.0, -nW.z) * 0.62 + max(0.0, nW.z) * 0.36;
        float elevGlow = smoothstep(4.0, 48.0, vInkW.y) * 0.34;
        float celBand = floor(clamp((faceLight + elevGlow) * 2.8, 0.0, 2.99)) / 2.0;
        vec3 shadowCol = diffuseColor.rgb * vec3(0.46, 0.38, 0.62);
        vec3 midCol = diffuseColor.rgb * vec3(0.84, 0.74, 0.86);
        vec3 litCol = mix(diffuseColor.rgb * 1.12, vec3(0.98, 0.86, 0.68), 0.28);
        vec3 celTone = mix(shadowCol, mix(midCol, litCol, clamp(celBand * 2.0 - 1.0, 0.0, 1.0)), clamp(celBand * 2.0, 0.0, 1.0));
        vec3 shaded = max(baseLight, celTone);
        float torchBounce = smoothstep(26.0, 2.0, vInkW.y) * wallMask;
        shaded = mix(shaded, shaded + vec3(0.32, 0.12, 0.06), torchBounce * 0.48);
        float frieze = wallMask * step(0.84, fract(vInkW.y * 0.11));
        shaded = mix(shaded, vec3(0.96, 0.72, 0.28), frieze * 0.42);
        float chisel = nEdge * step(0.05, nW.y + 0.45 * abs(nW.x)) * (1.0 - step(0.76, nEdge));
        vec3 rimGold = vec3(0.99, 0.80, 0.38) * (chisel * 0.68 + step(0.65, nW.y) * 0.16);
        vec3 outgoingLight = mix(shaded + rimGold, vec3(0.03, 0.02, 0.06), inkMask);`,
      );
  };
  material.customProgramCacheKey = () => 'paint-ink-hades-v3';
  const dispose = material.dispose.bind(material);
  material.dispose = () => { gradient.dispose(); dispose(); };
  return material;
}

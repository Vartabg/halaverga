import { DataTexture, LinearFilter, MeshToonMaterial, NoColorSpace, RedFormat } from 'three';

/** Mount Hermon at dawn palette (1 Enoch 6): cool twilight-slate shadow stone, warm dawn-gilded limestone,
 * covenant gold, and crisp snow-alabaster crests. */
export const INK = {
  rock: '#6c687c', lit: '#f4e6cf', shaft: '#8c8090', plinth: '#464358', crown: '#f2b84b', cap: '#f7f3eb', broken: '#7a6860',
  ember: '#e87a48', jade: '#2d7a6e', obsidian: '#222538',
} as const;
/** Material group on the merged city mesh. Appended so the six older groups keep their indexes. */
export const INK_GROUP = 6;
/** How much of the sky fill survives on the paint. */
export const INK_SKY = 0.28;

/** Smooth alpine dawn material: soft gradient ramp, twilight sky-bounce shadows, procedural micro-relief, and dawn alpenglow on snow. */
export function paintInkMaterial() {
  const ramp = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const t = i / 31, s = t * t * (3 - 2 * t);
    ramp[i] = Math.round(118 + 137 * s);
  }
  const gradient = new DataTexture(ramp, 32, 1, RedFormat);
  gradient.magFilter = LinearFilter;
  gradient.minFilter = LinearFilter;
  gradient.colorSpace = NoColorSpace;
  gradient.needsUpdate = true;
  const material = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient, toneMapped: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vInkW;\nvarying vec3 vInkN;\nvarying vec2 vInkUv;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInkW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvInkN = normalize(mat3(modelMatrix) * objectNormal);\nvInkUv = uv;');
    shader.fragmentShader = 'varying vec3 vInkW;\nvarying vec3 vInkN;\nvarying vec2 vInkUv;\n'
      + shader.fragmentShader.replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `reflectedLight.indirectDiffuse *= ${INK_SKY};
        float inkFade = 1.0 - smoothstep(85.0, 265.0, distance(cameraPosition, vInkW));
        vec3 micro = vec3(
          sin(vInkW.x * 0.45 + vInkW.z * 0.31) * cos(vInkW.y * 0.55) + 0.45 * sin(vInkW.x * 1.3 - vInkW.z * 1.1),
          cos(vInkW.x * 0.38 - vInkW.z * 0.42) * 0.6,
          sin(vInkW.z * 0.48 - vInkW.y * 0.37) * cos(vInkW.x * 0.51) + 0.45 * cos(vInkW.z * 1.2 + vInkW.y * 0.9)
        ) * (0.065 * inkFade);
        vec3 nW = normalize(vInkN + micro);
        vec3 baseLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
        float sunFace = clamp(max(0.0, nW.y) * 0.56 + max(0.0, -nW.x) * 0.52 + max(0.0, nW.z) * 0.42, 0.0, 1.0);
        float softBand = smoothstep(0.04, 0.92, sunFace);
        vec3 shadowCol = diffuseColor.rgb * vec3(0.56, 0.60, 0.76);
        vec3 midCol = diffuseColor.rgb * vec3(0.86, 0.82, 0.88);
        vec3 litCol = mix(diffuseColor.rgb * 1.06, vec3(0.99, 0.91, 0.80), 0.24);
        vec3 dawnTone = mix(shadowCol, mix(midCol, litCol, smoothstep(0.35, 0.95, softBand)), smoothstep(0.0, 0.65, softBand));
        vec3 shaded = mix(baseLight, dawnTone, 0.78);
        float cliffBand = 0.5 + 0.5 * sin(vInkW.y * 0.34 + vInkW.x * 0.06 - vInkW.z * 0.05 + sin(vInkW.x * 0.14) * 0.8);
        float steepCliff = clamp(1.0 - nW.y * 1.15, 0.0, 1.0);
        vec3 strataTint = mix(vec3(0.42, 0.43, 0.54), vec3(0.76, 0.68, 0.62), cliffBand);
        shaded = mix(shaded, shaded * strataTint * 1.32, steepCliff * 0.46 * inkFade);
        float snowRipple = 0.5 + 0.5 * sin(vInkW.x * 0.18 + vInkW.z * 0.14 + sin(vInkW.x * 0.05) * 2.0);
        float snowMask = smoothstep(0.55, 0.84, nW.y + 0.05 * snowRipple) * smoothstep(28.0, 66.0, vInkW.y);
        vec3 snowTint = mix(vec3(0.76, 0.81, 0.93), vec3(0.98, 0.95, 0.90), softBand);
        shaded = mix(shaded, snowTint, snowMask * 0.72);
        float alpenglow = pow(clamp(1.0 - abs(nW.y - 0.45), 0.0, 1.0), 2.0) * smoothstep(0.25, 0.85, sunFace) * smoothstep(18.0, 72.0, vInkW.y);
        vec3 rimGold = vec3(0.99, 0.79, 0.48) * (alpenglow * 0.24 * inkFade + snowMask * softBand * 0.08);
        float gorgeMist = (1.0 - smoothstep(1.5, 19.0, vInkW.y)) * 0.22;
        vec3 outgoingLight = mix(shaded + rimGold, vec3(0.85, 0.74, 0.59), gorgeMist);`,
      );
  };
  material.customProgramCacheKey = () => 'paint-ink-dawn-sky-v1';
  const dispose = material.dispose.bind(material);
  material.dispose = () => { gradient.dispose(); dispose(); };
  return material;
}

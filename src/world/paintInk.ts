import { DataTexture, MeshToonMaterial, NearestFilter, NoColorSpace, RedFormat } from 'three';

/** Flat paint for the arrival rock and the Watcher steles. Display hex, one colour per piece. The light, not a photo, makes the shadow. */
export const INK = {
  rock: '#6b5344', lit: '#e4d2b0', shaft: '#7a5c42', plinth: '#4e4036', crown: '#c4894a', cap: '#a56b32', broken: '#3c342e',
} as const;
/** Material group on the merged city mesh. Appended so the six older groups keep their indexes. */
export const INK_GROUP = 6;
/** How much of the sky fill survives on the paint. The sun still draws the one hard step. */
export const INK_SKY = 0.28;
/** Grey value of the shadow band in the gradient (the lit band is white). Four texels, nearest, step at ndotl = 0. */
const SHADOW = 107;

/** A toon material: vertex colour is the paint, the gradient is one hard shadow, and no photo map is attached. */
export function paintInkMaterial() {
  const gradient = new DataTexture(new Uint8Array([SHADOW, SHADOW, 255, 255]), 4, 1, RedFormat);
  gradient.magFilter = NearestFilter;
  gradient.minFilter = NearestFilter;
  gradient.colorSpace = NoColorSpace;
  gradient.needsUpdate = true;
  const material = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient, toneMapped: false });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      `reflectedLight.indirectDiffuse *= ${INK_SKY};\n\tvec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;`,
    );
  };
  const dispose = material.dispose.bind(material);
  material.dispose = () => { gradient.dispose(); dispose(); };
  return material;
}

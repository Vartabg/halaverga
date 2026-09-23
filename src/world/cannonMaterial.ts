// The arm cannon's emissive mask: one 8x8 palette PNG whose channels mark the core lens (R), the heat strips (G 255) and the copper
// fins (G 128), and the ring set (B: muzzle lip, barrel collar, slide coils). The shader sums them against four live colours, so one
// material drives every glow state; the fins glow only when hot, so the cool fins read as copper instead of cyan.
import { Color, type MeshStandardMaterial } from 'three';

export type CannonUniforms = { uCore: { value: Color }; uHeat: { value: Color }; uFin: { value: Color }; uRing: { value: Color } };

export const CANNON_PROGRAM_KEY = 'arm-cannon-mask-v2';
const CHUNK = '#include <emissivemap_fragment>';
const PREFIX = 'uniform vec3 uCore;\nuniform vec3 uHeat;\nuniform vec3 uFin;\nuniform vec3 uRing;\n';
/** Without an emissive map (a broken export) the mask reads as black instead of failing to compile. */
const MASK = [
  '#ifdef USE_EMISSIVEMAP',
  'vec3 cannonMask = texture2D( emissiveMap, vEmissiveMapUv ).rgb;',
  'float cannonStrip = step( 0.75, cannonMask.g ), cannonFin = step( 0.25, cannonMask.g ) - cannonStrip;',
  'totalEmissiveRadiance = cannonMask.r * uCore + cannonStrip * uHeat + cannonFin * uFin + cannonMask.b * uRing;',
  '#else',
  'totalEmissiveRadiance = vec3( 0.0 );',
  '#endif',
].join('\n');

type ShaderLike = { uniforms: Record<string, { value: unknown }>; fragmentShader: string };

/** Patches the material in place. The returned uniform objects are the ones the compiled program reads. */
export function installEmissiveMask(material: MeshStandardMaterial): CannonUniforms {
  const uniforms: CannonUniforms = { uCore: { value: new Color(0, 0, 0) }, uHeat: { value: new Color(0, 0, 0) }, uFin: { value: new Color(0, 0, 0) },
    uRing: { value: new Color(0, 0, 0) } };
  material.emissive.setRGB(1, 1, 1);
  material.customProgramCacheKey = () => CANNON_PROGRAM_KEY;
  material.onBeforeCompile = (shader: ShaderLike) => {
    shader.uniforms.uCore = uniforms.uCore; shader.uniforms.uHeat = uniforms.uHeat; shader.uniforms.uFin = uniforms.uFin;
    shader.uniforms.uRing = uniforms.uRing;
    shader.fragmentShader = PREFIX + shader.fragmentShader.replace(CHUNK, MASK);
  };
  material.needsUpdate = true;
  return uniforms;
}

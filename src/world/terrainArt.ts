import { LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, TextureLoader, type IUniform, type Texture } from 'three';

/** Two CC0 Poly Haven diffuse maps shared by the ground and carved stone. */
export const TERRAIN_ART = { rock: '/textures/terrain/limestone-cliff.jpg', snow: '/textures/terrain/snow.jpg' };
export type TerrainUniforms = {
  uRock: IUniform<Texture | null>; uSnow: IUniform<Texture | null>;
  uRockOn: IUniform<number>; uSnowOn: IUniform<number>; uTexOn: IUniform<number>;
};

export const terrainUniforms = (): TerrainUniforms => ({
  uRock: { value: null }, uSnow: { value: null }, uRockOn: { value: 0 }, uSnowOn: { value: 0 }, uTexOn: { value: 0 },
});

/** Load each map independently. The carved stone shader still blends the pair after both arrive. */
export function loadTerrainArt(uniforms: TerrainUniforms, onReady: () => void) {
  const loader = new TextureLoader(), loaded: Texture[] = [];
  let live = true, pending = 2;
  const take = (key: 'uRock' | 'uSnow', url: string) => loader.load(url, texture => {
    if (!live) { texture.dispose(); return; }
    texture.wrapS = texture.wrapT = RepeatWrapping; texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearMipmapLinearFilter; texture.anisotropy = 4; texture.needsUpdate = true;
    uniforms[key].value = texture;
    uniforms[key === 'uRock' ? 'uRockOn' : 'uSnowOn'].value = 1;
    loaded.push(texture);
    if (--pending === 0) uniforms.uTexOn.value = 1;
    onReady();
  }, undefined, () => { /* A missing map keeps its procedural albedo. */ });
  take('uRock', TERRAIN_ART.rock); take('uSnow', TERRAIN_ART.snow);
  return () => {
    live = false;
    loaded.forEach(t => t.dispose());
    uniforms.uRock.value = uniforms.uSnow.value = null;
    uniforms.uRockOn.value = uniforms.uSnowOn.value = uniforms.uTexOn.value = 0;
  };
}

/** Scene mounts one loader for the massif, distant relief and carved stone. */
export const sharedTerrain = terrainUniforms();
let users = 0, release: (() => void) | null = null;
export function acquireTerrainArt(onReady: () => void) {
  if (users++ === 0) release = loadTerrainArt(sharedTerrain, onReady);
  return () => { if (--users === 0) { release?.(); release = null; } };
}

/** Which vertex colours count as stone (and are replaced by limestone or snow): saturation in sRGB (HSV, as the shader measures it)
 * below STONE_SAT[0] is stone, above STONE_SAT[1] an accent (gold, jade, ember, bronze) that is left alone. INK.rock is .36 and
 * INK.plinth .42, the accents .55 and up. */
export const STONE_SAT = [.5, .58] as const;
export const srgbSaturation = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(...c);
  return (max - Math.min(...c)) / Math.max(max, .001);
};
/** Mean linear luminance of each map, so a texture divides out to detail around 1 and the albedo keeps its tone. */
export const ROCK_MEAN = '.104', SNOW_MEAN = '.38';
export const terrainFragmentPars = /* glsl */`
uniform sampler2D uRock;
uniform sampler2D uSnow;
uniform float uTexOn;
vec3 biplanar(sampler2D t, vec3 p, vec3 n) {
  vec3 dx = dFdx(p), dy = dFdy(p), a = abs(n);
  ivec3 ma = (a.x > a.y && a.x > a.z) ? ivec3(0, 1, 2) : (a.y > a.z) ? ivec3(1, 2, 0) : ivec3(2, 0, 1);
  ivec3 mi = (a.x < a.y && a.x < a.z) ? ivec3(0, 1, 2) : (a.y < a.z) ? ivec3(1, 2, 0) : ivec3(2, 0, 1);
  ivec3 me = ivec3(3) - mi - ma;
  vec3 x = textureGrad(t, vec2(p[ma.y], p[ma.z]), vec2(dx[ma.y], dx[ma.z]), vec2(dy[ma.y], dy[ma.z])).rgb;
  vec3 y = textureGrad(t, vec2(p[me.y], p[me.z]), vec2(dx[me.y], dx[me.z]), vec2(dy[me.y], dy[me.z])).rgb;
  vec2 w = clamp((vec2(a[ma.x], a[me.x]) - .5773) / (1. - .5773), 0., 1.) + 1e-4;
  return (x * w.x + y * w.y) / (w.x + w.y);
}
`;
/** Runs before the lights, so the light sees the new albedo. Sets diffuseColor to white snow (flat, high ground) or grey layered limestone (everything else), the vertex colour kept only as a
 * subtle zone tint (about a quarter). `whole` is the massif; elsewhere only low-saturation stone colours change (the purple ink
 * rock, plinths and caps), so gold, jade and ember accents survive. Leaves `tK` (how much art applies here, 0 until the maps load)
 * for the cel and ink constants. Detail fades to plain albedo with distance. nW is the world normal. */
export const terrainFragment = (whole: boolean) => /* glsl */`
vec3 tS = pow(max(diffuseColor.rgb, 0.), vec3(.4545));
float tMax = max(max(tS.r, tS.g), tS.b), tSat = (tMax - min(min(tS.r, tS.g), tS.b)) / max(tMax, .001);
float tOwn = ${whole ? '1.' : `1. - smoothstep(${STONE_SAT[0]}, ${STONE_SAT[1]}, tSat)`};
float tK = uTexOn * tOwn;
float tSnow = smoothstep(.42, .72, nW.y) * smoothstep(4., 30., vInkW.y) * ${whole ? '1.' : '.3'};
vec3 tRock = biplanar(uRock, vInkW * .06, nW), tIce = biplanar(uSnow, vInkW * .1, nW);
float tNear = 1. - smoothstep(160., 520., distance(cameraPosition, vInkW));
vec3 rockDetail = mix(vec3(1.), pow(clamp(vec3(dot(tRock, vec3(.2126, .7152, .0722))) / ${ROCK_MEAN}, .25, 2.4), vec3(1.35)), tNear);
vec3 snowDetail = mix(vec3(1.), clamp(tIce / ${SNOW_MEAN}, .6, 1.2), tNear);
vec3 rockAlbedo = mix(vec3(.43, .405, .36) * rockDetail, diffuseColor.rgb, .26);
vec3 snowAlbedo = mix(vec3(.72, .75, .77) * snowDetail, diffuseColor.rgb, .2);
diffuseColor.rgb = mix(diffuseColor.rgb, mix(rockAlbedo, snowAlbedo, tSnow), tK);`;

import { CLOUD, HAZE, skyDirection, SKY, SKY_STOPS_H, SUN_CORE, SUN_CREAM, SUN_DISC, SUN_GLOW, SUN_PALE, SUN_XZ, glslVec3 } from './atmospherePalette';

const num = (v: number) => v.toFixed(5);
const cosDeg = (deg: number) => Math.cos(deg * Math.PI / 180);
/** One cloud gap as GLSL: its centre direction and the cosines of its fade and clear radii. */
const gapGlsl = (i: number) => { const g = CLOUD.gaps[i]; return `const vec3 GAP_${i} = vec3(${skyDirection(g.az, g.el).map(num).join(', ')});\nconst vec2 GAP_${i}_COS = vec2(${num(cosDeg(g.fade))}, ${num(cosDeg(g.clear))});`; };

/** GLSL twin of skyBase() in atmospherePalette.ts: keep the two identical. Shared by the dome and the water reflection, so a mirror
 * of the sky is the sky. Linear display-referred colours; exactly SKY_HAZE at and below eye level at every azimuth. */
export const skyBaseGlsl = /* glsl */`
const vec3 SKY_HAZE = ${glslVec3(HAZE)};
const vec3 SKY_LOW = ${glslVec3(SKY.low)};
const vec3 SKY_MID = ${glslVec3(SKY.mid)};
const vec3 SKY_ZENITH = ${glslVec3(SKY.zenith)};
const vec3 SKY_WARM = ${glslVec3(SKY.warm)};
const vec2 SUN_XZ = vec2(${num(SUN_XZ[0])}, ${num(SUN_XZ[1])});
vec3 skyBase(vec3 dir) {
  float h = max(dir.y, 0.);
  vec3 c = mix(SKY_HAZE, SKY_LOW, smoothstep(0., ${num(SKY_STOPS_H.low)}, h));
  c = mix(c, SKY_MID, smoothstep(${num(SKY_STOPS_H.low)}, ${num(SKY_STOPS_H.mid)}, h));
  c = mix(c, SKY_ZENITH, smoothstep(${num(SKY_STOPS_H.mid)}, 1., h));
  c = mix(c, SKY_HAZE, exp(-h * 22.) * .78);
  float toSun = .5 + .5 * dot(dir.xz, SUN_XZ) / max(length(dir.xz), 1e-4);
  return mix(c, SKY_WARM, pow(toSun, 3.) * smoothstep(0., .08, h) * exp(-h * 5.) * .35);
}`;

/** The dome sits at the origin; its depth is pinned to the far plane so a 700 m sphere survives far 650. */
export const domeVertex = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_Position.z = gl_Position.w;
}`;

/** Display-referred: the colours below are what appear on screen (toneMapped is off, colorspace_fragment only encodes sRGB). The
 * direction is taken from the camera, not the origin, so the horizon is at eye level whatever the height. Clouds are a flat layer
 * read in five taps of a baked texture: the shape, two coarse reads for the light (one shifted toward the sun: a broad slope, so a
 * cloud has a lit side and a soft shaded base and no creases), the weather map and an edge roughness read. The roughness only acts
 * where the mass already is (no specks), and the edge softens with height, where the flat layer is magnified most. Clouds fade out
 * before the horizon so nothing smears into curtains. The sun's glow is mixed, not added: disc, cream, then a wide warm white lift
 * that dissolves into the sky (white, not blue, so the path never crosses a grey). */
export const domeFragment = /* glsl */`
varying vec3 vWorld;
uniform vec3 uSun;
uniform sampler2D uClouds;
uniform vec2 uWind;
const vec3 SUN_GOLD = ${glslVec3(SUN_DISC)};
const vec3 SUN_CORE = ${glslVec3(SUN_CORE)};
const vec3 SUN_CREAM = ${glslVec3(SUN_CREAM)};
const vec3 SUN_PALE = ${glslVec3(SUN_PALE)};
const vec3 CLOUD_LIT = ${glslVec3(CLOUD.lit)};
const vec3 CLOUD_SHADE = ${glslVec3(CLOUD.shade)};
const float CLOUD_COVER = ${num(CLOUD.coverage)};
const float CLOUD_SCALE = ${num(CLOUD.scale)};
const float CLOUD_LIFT = ${num(CLOUD.lift)};
const float WEATHER_SCALE = ${num(CLOUD.weatherScale)};
const float WEATHER_SWING = ${num(CLOUD.weatherSwing)};
const vec2 CLOUD_OFFSET = vec2(${num(CLOUD.offset[0])}, ${num(CLOUD.offset[1])});
const float GAP_LIFT = ${num(CLOUD.gapLift)};
${gapGlsl(0)}
${gapGlsl(1)}
${skyBaseGlsl}
/* Interleaved gradient noise: a cheap screen-space dither, one fract chain, no sin. */
float dither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float h = max(dir.y, 0.);
  vec3 col = skyBase(dir);
  vec2 uv = dir.xz / (h + CLOUD_LIFT) * CLOUD_SCALE + CLOUD_OFFSET + uWind;
  vec4 t = texture2D(uClouds, uv);
  float n = t.r * .82 + t.g * .18;
  float gap = max(smoothstep(GAP_0_COS.x, GAP_0_COS.y, dot(dir, GAP_0)), smoothstep(GAP_1_COS.x, GAP_1_COS.y, dot(dir, GAP_1)));
  float cover = CLOUD_COVER + (.5 - texture2D(uClouds, uv * WEATHER_SCALE).b) * WEATHER_SWING + gap * GAP_LIFT;
  float rough = (texture2D(uClouds, uv * 3.1 + .37).g - .5) * (.07 + .05 * smoothstep(.3, .9, h)) * smoothstep(cover - .04, cover + .12, n);
  float shape = n + rough;
  float ramp = clamp(fwidth(n) * 5., mix(.075, .05, smoothstep(.3, .6, h)), .12);
  float dens = smoothstep(cover, cover + ramp, shape) * smoothstep(.02, .2, h);
  float soft = texture2D(uClouds, uv, 2.8).r, softSun = texture2D(uClouds, uv + SUN_XZ * .03, 2.8).r;
  float core = smoothstep(cover + ramp, cover + .3, shape);
  float lit = clamp(.74 + (soft - softSun) * 4. - core * .2, 0., 1.);
  vec3 cloud = mix(CLOUD_SHADE, CLOUD_LIT, lit);
  float s = max(dot(dir, uSun), 0.);
  float rim = dens * (1. - smoothstep(cover + ramp, cover + .2, shape));
  cloud += SUN_CREAM * rim * pow(s, 5.) * .9;
  cloud = mix(cloud, SKY_HAZE, exp(-h * 9.) * .6);
  col = mix(col, cloud, dens * .92);
  float q = 1. - s, veil = 1. - dens * .85;
  col = mix(col, SUN_PALE, exp(-q * ${num(SUN_GLOW.pale.rate)}) * ${num(SUN_GLOW.pale.weight)} * veil);
  col = mix(col, SUN_CREAM, exp(-q * ${num(SUN_GLOW.cream.rate)}) * ${num(SUN_GLOW.cream.weight)} * veil);
  float disc = (1. - smoothstep(${num(SUN_GLOW.disc[0])}, ${num(SUN_GLOW.disc[1])}, q)) * (1. - dens * .9);
  col = mix(col, mix(SUN_CORE, SUN_GOLD, smoothstep(0., ${num(SUN_GLOW.core)}, q)), disc);
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (dither(gl_FragCoord.xy) - .5) / 255.;
}`;

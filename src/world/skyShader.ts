import { CLOUD, HAZE, SKY, SKY_STOPS_H, SUN_GLOW, SUN_XZ, glslVec3 } from './atmospherePalette';

const num = (v: number) => v.toFixed(5);

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
  c = mix(c, SKY_HAZE, exp(-h * 14.) * .8);
  float toSun = .5 + .5 * dot(dir.xz, SUN_XZ) / max(length(dir.xz), 1e-4);
  return mix(c, SKY_WARM, pow(toSun, 3.) * smoothstep(0., .08, h) * exp(-h * 4.) * .3);
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
 * direction is taken from the camera, not the origin, so the horizon is at eye level whatever the height. The ash ceiling is a flat
 * layer read in four taps of a baked texture: the billow, a coarse read for its thickness, the weather map (heavier banks) and an edge
 * roughness read. It covers almost all of the sky: thin parts are a lighter grey-brown, thick parts sag dark, and the whole layer
 * dissolves into the haze toward the horizon. Where the sun is, the thin cloud brightens into a dull smear; there is no disc. */
export const domeFragment = /* glsl */`
varying vec3 vWorld;
uniform vec3 uSun;
uniform sampler2D uClouds;
uniform vec2 uWind;
const vec3 GLOW = ${glslVec3(SUN_GLOW.color)};
const vec3 CLOUD_LIT = ${glslVec3(CLOUD.lit)};
const vec3 CLOUD_SHADE = ${glslVec3(CLOUD.shade)};
const float CLOUD_COVER = ${num(CLOUD.coverage)};
const float CLOUD_SCALE = ${num(CLOUD.scale)};
const float CLOUD_LIFT = ${num(CLOUD.lift)};
const float WEATHER_SCALE = ${num(CLOUD.weatherScale)};
const float WEATHER_SWING = ${num(CLOUD.weatherSwing)};
const vec2 CLOUD_OFFSET = vec2(${num(CLOUD.offset[0])}, ${num(CLOUD.offset[1])});
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
  float weather = .5 - texture2D(uClouds, uv * WEATHER_SCALE).b;
  float cover = CLOUD_COVER + weather * WEATHER_SWING;
  float rough = (texture2D(uClouds, uv * 3.1 + .37).g - .5) * .08;
  float dens = smoothstep(cover - .08, cover + .1, n + rough) * smoothstep(.0, .14, h);
  float soft = texture2D(uClouds, uv, 2.8).r;
  float thick = clamp(smoothstep(.25, .8, soft) + weather * .6, 0., 1.);
  float s = max(dot(dir, uSun), 0.), q = 1. - s;
  vec3 cloud = mix(CLOUD_LIT, CLOUD_SHADE, thick);
  cloud = mix(cloud, GLOW, exp(-q * ${num(SUN_GLOW.rate)} * .6) * (1. - thick * .7) * ${num(SUN_GLOW.weight)});
  cloud = mix(cloud, SKY_HAZE, exp(-h * 7.) * .75);
  col = mix(col, cloud, dens * .96);
  col = mix(col, GLOW, exp(-q * ${num(SUN_GLOW.rate)}) * ${num(SUN_GLOW.weight)} * (1. - dens * .6));
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (dither(gl_FragCoord.xy) - .5) / 255.;
}`;

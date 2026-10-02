import { HAZE, SKY, SKY_STOPS_H, SUN_COLOR, SUN_XZ, glslVec3 } from './atmospherePalette';

const num = (v: number) => v.toFixed(5);

/** GLSL twin of skyBase() in atmospherePalette.ts: keep the two identical. Shared by the dome and the water reflection, so a mirror
 * of the sky is the sky. Linear display-referred colours; exactly SKY_HAZE at and below eye level at every azimuth. */
export const skyBaseGlsl = /* glsl */`
const vec3 SKY_HAZE = ${glslVec3(HAZE)};
const vec3 SKY_LOW = ${glslVec3(SKY.low)};
const vec3 SKY_MID = ${glslVec3(SKY.mid)};
const vec3 SKY_ZENITH = ${glslVec3(SKY.zenith)};
const vec3 SKY_WARM = ${glslVec3(SKY.warm)};
const vec3 SKY_SUN = ${glslVec3(SUN_COLOR)};
const vec2 SUN_XZ = vec2(${num(SUN_XZ[0])}, ${num(SUN_XZ[1])});
vec3 skyBase(vec3 dir) {
  float h = max(dir.y, 0.);
  vec3 c = mix(SKY_HAZE, SKY_LOW, smoothstep(0., ${num(SKY_STOPS_H.low)}, h));
  c = mix(c, SKY_MID, smoothstep(${num(SKY_STOPS_H.low)}, ${num(SKY_STOPS_H.mid)}, h));
  c = mix(c, SKY_ZENITH, smoothstep(${num(SKY_STOPS_H.mid)}, 1., h));
  c = mix(c, SKY_HAZE, exp(-h * 18.) * .8);
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
 * direction is taken from the camera, not the origin, so the horizon is at eye level whatever the height. */
export const domeFragment = /* glsl */`
varying vec3 vWorld;
uniform vec3 uSun;
${skyBaseGlsl}
/* Interleaved gradient noise: a cheap screen-space dither, one fract chain, no sin. */
float dither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  vec3 col = skyBase(dir);
  float s = max(dot(dir, uSun), 0.);
  col += SKY_SUN * (pow(s, 16.) * .18 + pow(s, 160.) * .5);
  col = mix(col, SKY_SUN * 1.5, smoothstep(.99984, .99996, s));
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (dither(gl_FragCoord.xy) - .5) / 255.;
}`;

import { DAWN_BELT, HAZE, HORIZON_FADE, SKY, SKY_STOPS_H, SUN, SUN_DIRECTION, SUN_GLOW, VALLEY_FOG, glslRgb, glslVec3 } from './atmospherePalette';

/** Read by the dome, water and terrain. Directions use the same daylight as the reflection map. */
export const skyBaseGlsl = /* glsl */ `
const vec3 SUN_DIR = ${glslRgb(SUN_DIRECTION)};
vec3 skyBase(vec3 dir) {
  float h = max(dir.y, 0.);
  vec3 c = mix(${glslVec3(HAZE)}, ${glslVec3(SKY.low)}, smoothstep(0., ${SKY_STOPS_H.low}, h));
  c = mix(c, ${glslVec3(SKY.mid)}, smoothstep(${SKY_STOPS_H.low}, ${SKY_STOPS_H.mid}, h));
  c = mix(c, ${glslVec3(SKY.zenith)}, smoothstep(${SKY_STOPS_H.mid}, 1., h));
  float sunward = dot(vec3(dir.x, h, dir.z), SUN_DIR);
  float belt = smoothstep(.008, .066, h) * (1. - smoothstep(.11, .24, h)) * (.72 - .28 * sunward);
  c = mix(c, ${glslVec3(DAWN_BELT.color)}, belt * ${DAWN_BELT.strength});
  return mix(c, ${glslVec3(SKY.warm)}, exp(-(1. - sunward) * ${SUN_GLOW.rate.toFixed(1)} - h * ${SUN_GLOW.vertical}) * ${SUN_GLOW.weight});
}
`;

export const terrainHazeGlsl = /* glsl */ `
float valleyAir(float fromY, float toY) {
  const float depth = ${VALLEY_FOG.depth.toFixed(1)};
  float low = min(fromY, toY), high = max(fromY, toY), rise = high - low;
  if (high <= 0.) return 1.;
  if (rise < .1) return exp(-max(0., (fromY + toY) * .5) / depth);
  float above = depth * (exp(-max(0., low) / depth) - exp(-high / depth));
  return (above - min(0., low)) / rise;
}
vec3 aerated(vec3 surface, vec3 world, vec3 eye) {
  vec3 view = world - eye;
  float span = length(view), inValley = min(span, ${VALLEY_FOG.reach.toFixed(1)});
  float endY = mix(eye.y, world.y, inValley / max(span, .001));
  float veil = 1. - exp(-span * ${VALLEY_FOG.air.toFixed(6)} - inValley * ${VALLEY_FOG.density} * valleyAir(eye.y, endY));
  vec2 az = view.xz / max(length(view.xz), .001);
  float horizon = smoothstep(${HORIZON_FADE[0].toFixed(1)}, ${HORIZON_FADE[1].toFixed(1)}, span);
  return mix(surface, skyBase(vec3(az.x, 0., az.y)), mix(veil, 1., horizon));
}
`;

export const domeVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_Position.z = gl_Position.w;
}
`;

const sunRadius = (2 * Math.sin(SUN.radius * Math.PI / 360)).toFixed(7);
export const domeFragment = /* glsl */ `
varying vec3 vWorld;
${skyBaseGlsl}
float skyHash(vec2 p) {
  vec3 h = fract(vec3(p.xyx) * .1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}
float skyNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1., 0.)), u.x),
    mix(skyHash(i + vec2(0., 1.)), skyHash(i + 1.), u.x), u.y);
}
float cirrus(vec3 dir) {
  float h = max(0., dir.y);
  vec2 p = mat2(.84, -.54, .54, .84) * dir.xz / (h + .23);
  vec2 uv = p * vec2(2.6, 6.0) + vec2(3.6, 7.5);
  float bank = skyNoise(p * 2.5 + 12.1);
  vec2 curl = vec2(skyNoise(p * 1.8), skyNoise(p * 4.2 + 19.7)) - .5;
  vec2 band = uv + curl * vec2(.72, 1.48);
  float streaks = skyNoise(band) * .57 + skyNoise(band * 2.2) * .27 + skyNoise(band * vec2(4.2, 5.1)) * .16;
  return smoothstep(.45, .77, bank) * smoothstep(.50, .84, streaks) * smoothstep(.035, .22, h);
}
float dither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
float stars(vec3 dir) {
  vec2 p = dir.xz * 214.;
  vec2 cell = floor(p), within = fract(p);
  float h = fract(52.9829189 * fract(dot(cell, vec2(.06711056, .00583715))));
  float point = 1. - smoothstep(.05, .25, length(within - vec2(.5, .56)));
  return step(.997, h) * point * smoothstep(.42, .8, dir.y);
}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  vec3 color = skyBase(dir);
  float radius = ${sunRadius};
  float separation = length(dir - SUN_DIR), edge = clamp(fwidth(separation) * .55, .000001, radius * .6);
  float sun = 1. - smoothstep(radius - edge, radius + edge, separation);
  vec3 cloud = mix(vec3(.73, .79, .84), vec3(.98, .84, .69), pow(max(0., dot(dir, SUN_DIR)), 6.));
  color = mix(color, cloud, .40 * cirrus(dir));
  color = mix(color, vec3(1., .96, .83), sun);
  color += vec3(.073, .08, .1) * stars(dir);
  gl_FragColor = vec4(color, 1.);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (dither(gl_FragCoord.xy) - .5) / 255.;
}
`;

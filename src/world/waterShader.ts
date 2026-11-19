import { WATER_BODY, WATER_CREST, glslRgb, glslVec3 } from './atmospherePalette';
import { skyBaseGlsl, terrainHazeGlsl } from './skyShader';

export const waterVertex = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const waterFragment = /* glsl */`
varying vec3 vWorld;
uniform float time;
uniform vec2 wake;
uniform float wakeStrength;
${skyBaseGlsl}
${terrainHazeGlsl}
void main() {
  vec2 p = vWorld.xz;
  float a = dot(p, vec2(.9, 1.7)) + time * .28 + sin(p.y * .37);
  float b = dot(p, vec2(2.4, -.8)) - time * .4 + sin(p.x * .42);
  float c = dot(p, vec2(5.3, 3.2)) + time * .35;
  float fa = 1. - smoothstep(.4, 1.2, fwidth(a));
  float fb = 1. - smoothstep(.2, .7, fwidth(b));
  float fc = 1. - smoothstep(.15, .5, fwidth(c));
  vec3 n = normalize(vec3(cos(a) * .026 * fa + cos(b) * .016 * fb, 1., sin(a) * .024 * fa + sin(c) * .012 * fc));
  vec3 view = normalize(cameraPosition - vWorld), reflected = reflect(-view, n);
  float fresnel = .025 + .92 * pow(1. - max(dot(n, view), 0.), 5.);
  float glint = exp(-max(0., 1. - dot(reflected, SUN_DIR)) * 260.) * smoothstep(-.02, .04, reflected.y);
  float wd = length(p - wake), ripple = wd * 5. - time * 7.;
  float rings = (1. - smoothstep(.25, 1.2, fwidth(ripple))) * pow(max(0., sin(ripple)), 6.);
  vec3 body = ${glslRgb(WATER_BODY)} * (1. + .13 * (sin(a) * fa + sin(b) * fb));
  body += ${glslVec3(WATER_CREST)} * wakeStrength * exp(-wd * .28) * rings * .24;
  body += vec3(1., .72, .46) * glint * .75;
  gl_FragColor = vec4(body, 1.);
  #include <tonemapping_fragment>
  vec3 reflectedSky = mix(skyBase(reflected), vec3(1., .91, .72), glint * .7);
  gl_FragColor.rgb = aerated(mix(gl_FragColor.rgb, reflectedSky, fresnel), vWorld, cameraPosition);
  #include <colorspace_fragment>
}`;

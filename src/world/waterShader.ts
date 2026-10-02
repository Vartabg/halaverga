import { WATER_BODY, glslRgb } from './atmospherePalette';
import { skyBaseGlsl } from './skyShader';

export const waterVertex = /* glsl */`
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

/** The water body (deep colour, shimmer, wake) is scene-referred and tone mapped like the city. The mirror of the sky is the sky
 * itself, display-referred, so at a grazing angle the water meets the dome exactly; the sun glint is tone mapped and added on top.
 * The far end is the scene fog (after the colour space chunk, like the city), so sea, city and skyline share one haze. Each ripple
 * fades out when it is finer than a pixel, so the far water is calm and clean instead of a moire. */
export const waterFragment = /* glsl */`
#include <fog_pars_fragment>
varying vec3 vWorld;
uniform float time;
uniform vec3 uSun;
uniform vec2 wake;
uniform float wakeStrength;
${skyBaseGlsl}
void main() {
  vec2 p = vWorld.xz;
  float a = p.x * .9 + p.y * 1.7 + time * .6 + sin(p.y * .37), b = p.x * 2.4 - p.y * .8 - time * .9 + sin(p.x * .42);
  float c = p.x * 5.3 + p.y * 3.2 + time * .8;
  float fa = 1. - smoothstep(.4, 1.2, fwidth(a)), fb = 1. - smoothstep(.2, .7, fwidth(b)), fc = 1. - smoothstep(.15, .5, fwidth(c));
  vec3 n = normalize(vec3(cos(a) * .045 * fa + cos(b) * .028 * fb, 1., sin(a) * .04 * fa + sin(c) * .022 * fc));
  vec3 view = normalize(cameraPosition - vWorld), reflected = reflect(-view, n);
  float fresnel = .025 + .65 * pow(1. - max(dot(n, view), 0.), 4.);
  vec3 body = ${glslRgb(WATER_BODY)} + vec3(.005, .012, .008) * sin(a) * sin(b) * fa * fb;
  float wd = length(p - wake);
  body += vec3(.15, .33, .26) * wakeStrength * exp(-wd * .28) * pow(max(0., sin(wd * 5. - time * 7.)), 6.);
  vec3 glint = pow(max(dot(reflected, uSun), 0.), 500.) * vec3(2.2, 1.8, 1.1);
  gl_FragColor = vec4(body, 1.);
  #include <tonemapping_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, skyBase(reflected), min(fresnel, .85));
  #ifdef TONE_MAPPING
  gl_FragColor.rgb += toneMapping(glint);
  #else
  gl_FragColor.rgb += glint;
  #endif
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

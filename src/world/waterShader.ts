import { WATER_BODY, WATER_RUST, WATER_SCUM, WATER_SICK, glslRgb, glslVec3 } from './atmospherePalette';
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

/** The poisoned sea. The body (oily olive with sick yellow-green and rust patches, slow heavy ripples, a dirty wake) is
 * scene-referred and tone mapped like the city. The mirror of the sky is the sky itself, display-referred, so at a grazing angle the
 * water meets the dome exactly. On top, in display space: oil slicks that shift colour with the angle (a thin film), and pale scum
 * blotches. There is no sun glint: there is no sun. The far end is the scene fog. Ripples and the film fade out when they are finer
 * than a pixel, so the far water is calm instead of a moire. The noise is a sine-free hash (stable on phone GPUs). */
export const waterFragment = /* glsl */`
#include <fog_pars_fragment>
varying vec3 vWorld;
uniform float time;
uniform vec3 uSun;
uniform vec2 wake;
uniform float wakeStrength;
${skyBaseGlsl}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + 1.), u.x), u.y);
}
void main() {
  vec2 p = vWorld.xz;
  float a = p.x * .9 + p.y * 1.7 + time * .28 + sin(p.y * .37), b = p.x * 2.4 - p.y * .8 - time * .4 + sin(p.x * .42);
  float c = p.x * 5.3 + p.y * 3.2 + time * .35;
  float fa = 1. - smoothstep(.4, 1.2, fwidth(a)), fb = 1. - smoothstep(.2, .7, fwidth(b)), fc = 1. - smoothstep(.15, .5, fwidth(c));
  vec3 n = normalize(vec3(cos(a) * .026 * fa + cos(b) * .016 * fb, 1., sin(a) * .024 * fa + sin(c) * .012 * fc));
  vec3 view = normalize(cameraPosition - vWorld), reflected = reflect(-view, n);
  float fresnel = .02 + .55 * pow(1. - max(dot(n, view), 0.), 4.);
  vec2 drift = vec2(time * .05, time * .02);
  float sick = smoothstep(.45, .8, vnoise(p * .016 + drift * .1) * .65 + vnoise(p * .05) * .35);
  float rust = smoothstep(.55, .85, vnoise(p * .028 + 17.3 - drift * .08));
  vec3 body = mix(${glslRgb(WATER_BODY)}, ${glslRgb(WATER_SICK)}, sick * .85);
  body = mix(body, ${glslRgb(WATER_RUST)}, rust * .7);
  body += vec3(.004, .005, .003) * sin(a) * sin(b) * fa * fb;
  float wd = length(p - wake);
  body += vec3(.07, .07, .05) * wakeStrength * exp(-wd * .28) * pow(max(0., sin(wd * 5. - time * 7.)), 6.);
  gl_FragColor = vec4(body, 1.);
  #include <tonemapping_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, skyBase(reflected), min(fresnel, .7));
  float slick = smoothstep(.56, .74, vnoise(p * .03 + vec2(3.1, 7.7) + drift * .2));
  float fine = 1. - smoothstep(.3, .9, fwidth(p.x * .22));
  float film = vnoise(p * .22 + drift) * 1.6 + dot(view, n) * 2.4;
  vec3 irid = .5 + .5 * cos(6.2831 * (film + vec3(0., .33, .67)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * (.55 + .9 * irid), slick * fine * .5);
  float scum = smoothstep(.74, .86, vnoise(p * .17 + 41.) * .6 + vnoise(p * .6) * .4) * smoothstep(.55, .75, vnoise(p * .02 + 5.)) * fine;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, ${glslVec3(WATER_SCUM)}, scum * .35);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

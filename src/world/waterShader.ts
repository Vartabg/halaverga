import { skyBaseGlsl } from './skyShader';

export const waterVertex = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

/** The water body (deep colour, shimmer, wake) is scene-referred and tone mapped like the city. The mirror of the sky is the sky
 * itself, display-referred, so at a grazing angle the water meets the dome exactly; the sun glint is tone mapped and added on top,
 * and the far end fades to the haze colour. */
export const waterFragment = /* glsl */`
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
  vec3 n = normalize(vec3(cos(a) * .045 + cos(b) * .028, 1., sin(a) * .04 + sin(c) * .022));
  vec3 view = normalize(cameraPosition - vWorld), reflected = reflect(-view, n);
  float fresnel = .025 + .65 * pow(1. - max(dot(n, view), 0.), 4.);
  vec3 body = vec3(.018, .16, .145) + vec3(.005, .012, .008) * sin(a) * sin(b);
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
  gl_FragColor.rgb = mix(gl_FragColor.rgb, SKY_HAZE, smoothstep(110., 360., distance(cameraPosition, vWorld)));
  #include <colorspace_fragment>
}`;

// Shader patches for the shot and impact effects (fxMaterials.ts builds the materials). All of them keep three's own lighting,
// tone mapping and colour-space chunks; they only add per-instance alpha, billboarding, a point-size floor and the debris heat.
import type { WebGLProgramParametersWithUniforms } from 'three';

/** Sparks never draw below a uniform point size (drawing-buffer px); ImpactFx sets it from the pixel ratio each frame. */
export function sparkShader(uMinPoint: { value: number }) {
  return (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uMinPoint = uMinPoint;
    shader.vertexShader = shader.vertexShader.replace('uniform float scale;', 'uniform float scale;\nuniform float uMinPoint;')
      .replace('#include <logdepthbuf_vertex>', 'gl_PointSize = max(gl_PointSize, uMinPoint);\n#include <logdepthbuf_vertex>');
  };
}
/** Per-instance heat (aHeat 0..1) glows the torn tips and corners (far from the lump's middle) white-orange, cooling to dark metal; the
 *  faces stay metal. A small emissive floor keeps cold pieces readable once the glow is gone. Break chips and cold pieces write heat 0. */
export function debrisShader(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHeat;\nvarying float vHeat;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat * clamp(length(position) * 3. - .5, .12, 1.);');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHeat;')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * .1 + mix(vec3(.5, .06, .02), vec3(1., .6, .25), vHeat * vHeat) * 1.3 * vHeat;`);
}
export const tracerVertex = `attribute vec3 aStart; attribute vec3 aEnd; attribute float aWidth; attribute float aAlpha;
varying vec2 vUv; varying float vAlpha;
void main(){ vec3 mid = (aStart + aEnd) * .5, c = cross(aEnd - aStart, cameraPosition - mid); float l = length(c);
  vec3 p = mix(aStart, aEnd, position.x + .5) + (l > 1e-8 ? c / l : vec3(0.)) * aWidth * position.y;
  vUv = uv; vAlpha = aAlpha; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.); }`;
/**
 * A bolt of energy, not a rod: a white-hot core line (the middle 38% of the ribbon) inside a soft teal fringe, brighter toward the
 * head (uv.x 1) so the beam reads as a packet travelling from the arm to the point, at every range. Additive, so the core adds to
 * white over any sky and the fringe tints what it crosses.
 */
export const tracerFragment = `uniform vec3 core; uniform vec3 fringe; varying vec2 vUv; varying float vAlpha;
void main(){ float d = abs(vUv.y - .5) * 2., hot = 1. - smoothstep(0., .38, d), glow = (1. - smoothstep(.2, 1., d)) * .6;
  float head = mix(.55, 1., smoothstep(0., 1., vUv.x));
  gl_FragColor = vec4(mix(fringe, core, hot), min(1., hot + glow) * head * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/**
 * Per-instance alpha and view-space billboarding. The instance matrix carries position plus a 2x2 screen transform in its first two
 * columns' xy: a plain scale (fxMaterials.place) draws an upright sprite; a rotated pair (fxMaterials.placeTurned) a turned one.
 */
export function billboard(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
    .replace('#include <project_vertex>', `vAlpha = aAlpha;
vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
mvPosition.xy += instanceMatrix[0].xy * position.x + instanceMatrix[1].xy * position.y;
gl_Position = projectionMatrix * mvPosition;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
}
/**
 * The alpha-blended (smoke, dust) billboard with a lit edge: the puff's own colour fills its middle and a lighter shade of it
 * (2.4x + .06) takes over toward the soft edge, where the disc texture's alpha (1 - r)^2 falls off. Dark smoke then keeps a dark
 * centre against the overcast and a lit rim against the dark ruins, so it reads on either.
 */
export function billboardLit(shader: WebGLProgramParametersWithUniforms) {
  billboard(shader);
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>\ndiffuseColor.a *= vAlpha;',
    '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb * 2.4 + .06, diffuseColor.rgb, sqrt(clamp(diffuseColor.a, 0., 1.)));\ndiffuseColor.a *= vAlpha;');
}
/** Per-instance alpha on an ordinary (world-oriented) instanced quad: the scorch marks, laid flat on the surface they mark. */
export function flatAlpha(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
}

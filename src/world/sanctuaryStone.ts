import { Color, MeshBasicMaterial, MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';

/** Light the stone the way the scene's fiction does: crimson from the breach, ember from the abyss below, gold once it is sealed.
 * Computed in the stone's own shader (the sanctuary sits at the origin, so object space is world space); no extra scene lights. */
export const GATE = [0, 34, -146] as const;
export const stoneLight = { uGateFire: { value: 0 }, uGatePos: { value: GATE } };

const header = `varying vec3 vStone; varying vec3 vStoneN; uniform float uGateFire; uniform vec3 uGatePos;
float stoneHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

/** Dressed masonry: flagstones on level faces, staggered ashlar courses on walls and drums, and the launch dais inlaid in gold. */
const masonry = `#include <color_fragment>
  vec3 sn = normalize(vStoneN);
  float vein = abs(sin(vStone.y * .32 + sin(vStone.x * .22 + vStone.z * .17) * 2.1));
  float grain = fract(sin(dot(floor(vStone * 14.), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  diffuseColor.rgb *= .74 + .22 * smoothstep(.05, .18, vein) + .07 * grain;
  diffuseColor.rgb *= .78 + .22 * smoothstep(0., 18., vStone.y);
  vec2 cell; float joint;
  if (abs(sn.y) > .9) {
    vec2 f = vStone.xz / 3.2; cell = floor(f); vec2 g = abs(fract(f) - .5);
    joint = smoothstep(.465, .495, max(g.x, g.y));
  } else {
    float row = vStone.y / 1.6, along = abs(sn.x) > abs(sn.z) ? vStone.z : vStone.x;
    float u = along / 2.4 + .5 * mod(floor(row), 2.); cell = vec2(floor(u), floor(row));
    joint = max(smoothstep(.44, .49, abs(fract(row) - .5)), smoothstep(.465, .495, abs(fract(u) - .5)));
  }
  diffuseColor.rgb *= (.93 + .14 * stoneHash(cell)) * (1. - .42 * joint);
  vec2 dais = vStone.xz - vec2(0., 65.); float r = length(dais);
  float onDais = step(.9, sn.y) * step(19.9, vStone.y) * step(vStone.y, 20.1) * step(abs(dais.x), 12.) * step(abs(dais.y), 10.);
  float rings = max(1. - smoothstep(.05, .1, abs(r - 3.)), 1. - smoothstep(.05, .1, abs(r - 7.5)));
  float spokes = (1. - smoothstep(.04, .09, abs(sin(atan(dais.y, dais.x) * 4.)) * r * .25)) * step(3., r) * step(r, 7.5);
  float inlay = onDais * max(rings, spokes);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .46, .2), inlay);
`;

const glow = `#include <emissivemap_fragment>
  vec3 gn = normalize(vStoneN), toGate = uGatePos - vStone; float gd = length(toGate);
  vec3 gate = mix(vec3(.95, .13, .035), vec3(1., .74, .32), uGateFire);
  totalEmissiveRadiance += diffuseColor.rgb * gate * max(dot(gn, toGate / gd), 0.) * exp(-gd * .012) * 1.1;
  float under = max(-gn.y, 0.) + .3 * (1. - abs(gn.y));
  float ember = under * exp(-vStone.y * .06) * (.35 + .65 * exp(-abs(vStone.x) * .012)) * (1. - uGateFire * .6);
  totalEmissiveRadiance += diffuseColor.rgb * vec3(.6, .1, .025) * ember;
`;

function lit(material: MeshStandardMaterial, pattern: boolean) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, stoneLight);
    shader.vertexShader = header + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvStone = position; vStoneN = normal;');
    shader.fragmentShader = header + shader.fragmentShader
      .replace('#include <color_fragment>', pattern ? masonry : '#include <color_fragment>')
      .replace('#include <emissivemap_fragment>', glow);
  };
  material.customProgramCacheKey = () => pattern ? 'sanctuary-stone' : 'sanctuary-gold';
  return material;
}

/** The sanctuary's three shared surfaces: dressed stone, aged gold and the lit scripture panels. */
export function sanctuaryMaterials() {
  return [
    lit(new MeshStandardMaterial({ color: '#8b8c8c', roughness: .84, metalness: .05 }), true),
    lit(new MeshStandardMaterial({ color: '#c3a061', metalness: .62, roughness: .34, emissive: new Color('#1f1305') }), false),
    new MeshBasicMaterial({ color: '#ffe3a1', toneMapped: false }),
  ] as const;
}

/** Ease the breach light toward gold once it is sealed, and back to crimson on a regroup. */
export function stepStoneLight(won: boolean, dt: number) {
  const target = won ? 1 : 0, value = stoneLight.uGateFire.value;
  if (value === target) return false;
  const next = value + Math.sign(target - value) * Math.min(Math.abs(target - value), Math.min(dt, .04) * .6);
  stoneLight.uGateFire.value = next;
  return true;
}

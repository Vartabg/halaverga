import { MeshStandardMaterial } from 'three';
import { glslVec3 } from './atmospherePalette';
import { skyBaseGlsl, terrainHazeGlsl } from './skyShader';
import { ROCK_MEAN, SNOW_MEAN, sharedTerrain, type TerrainUniforms } from './terrainArt';

const varyings = /* glsl */ `
varying vec3 vTerrainWorld, vTerrainNormal;
varying vec3 vPassArt;
`;

const terrainFunctions = /* glsl */ `
uniform sampler2D uRock, uSnow;
uniform float uRockOn, uSnowOn;

float groundHash(vec2 p) {
  vec3 h = fract(vec3(p.xyx) * .1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}
float groundNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(groundHash(i), groundHash(i + vec2(1., 0.)), u.x),
    mix(groundHash(i + vec2(0., 1.)), groundHash(i + 1.), u.x), u.y);
}
vec3 limestoneMap(vec3 p, vec3 n, vec3 dx, vec3 dy) {
  vec3 w = pow(abs(n), vec3(4.));
  w /= w.x + w.y + w.z;
  return w.x * textureGrad(uRock, p.zy, dx.zy, dy.zy).rgb
       + w.y * textureGrad(uRock, p.xz, dx.xz, dy.xz).rgb
       + w.z * textureGrad(uRock, p.xy, dx.xy, dy.xy).rgb;
}
vec3 terrainAlbedo(vec3 p, vec3 n) {
  float distanceToEye = distance(cameraPosition, p);
  float detail = 1. - smoothstep(185., 980., distanceToEye);
  float coarse = groundNoise(p.xz * .032);
  float mottling = mix(.5, groundNoise(p.xz * .091 + p.y * .012), detail);
  float stratum = sin(dot(p, vec3(.108, .81, -.126)) + coarse * 3. + mottling * 2.);
  vec3 rock = mix(${glslVec3('#857c6c')}, ${glslVec3('#b8b2a1')}, coarse * .57 + mottling * .43);
  rock *= 1. + stratum * (1. - max(0., n.y)) * .14 * detail;
  float lowland = (1. - smoothstep(-1700., -600., p.y)) * smoothstep(.28, .9, n.y);
  rock = mix(rock, ${glslVec3('#777a5d')}, lowland * .73);
  vec3 snow = ${glslVec3('#e6e7e2')};
  vec3 coords = p * mix(.092, .053, vPassArt.z) + vPassArt.z * vec3(coarse * .28, mottling * .14, coarse * .19);
  vec3 dx = dFdx(coords), dy = dFdy(coords);
  if (detail > 0. && uRockOn > .5) {
    vec3 texel = limestoneMap(coords, n, dx, dy);
    float neutral = dot(texel, vec3(.2126, .7152, .0722)) / ${ROCK_MEAN};
    float grain = .78 - vPassArt.z * (.27 + .14 * smoothstep(35., 200., distanceToEye));
    rock *= mix(1., clamp(neutral, .44, 1.9), detail * grain);
  }
  if (detail > 0. && uSnowOn > .5) {
    vec3 texel = textureGrad(uSnow, coords.xz, dx.xz, dy.xz).rgb;
    snow *= mix(vec3(1.), clamp(texel / ${SNOW_MEAN}, .67, 1.12), detail * .68);
  }
  float broadDrift = groundNoise(p.xz * vec2(.009, .014) + vec2(21., 6.));
  float windCover = .57 * broadDrift + .29 * coarse + .14 * mottling;
  float snowline = mix(45., -112., smoothstep(620., 1700., length(p.xz)));
  float accumulation = smoothstep(snowline - 38., snowline + 26., p.y + 105. * (windCover - .5));
  float slope = smoothstep(.46, .77, n.y + n.z * .13);
  float snowCoverage = smoothstep(.35, .62, windCover + .11 * smoothstep(45., 155., p.y));
  float sheltered = smoothstep(.08, .78, vPassArt.x + (coarse - .5) * .23 + (mottling - .5) * .13) * step(.025, vPassArt.x);
  float scoured = smoothstep(.08, .8, -vPassArt.x);
  float deposit = max(slope * accumulation * snowCoverage, sheltered * smoothstep(.28, .81, n.y));
  float bed = sin(dot(p, vec3(.073, 1.34, -.105)) + coarse * 2.1);
  rock *= mix(vec3(1.), vec3(1.25, 1.045, .81) * (1. - smoothstep(.65, 1., bed) * .15 * detail), scoured);
  float ripple = sin(p.x * .54 + p.z * .19 + coarse * 10. + mottling * 1.2);
  snow *= 1. + .024 * ripple * sheltered * detail;
  return mix(rock, snow, deposit * (1. - .96 * scoured));
}
`;

/** Same limestone, snow and aerial perspective across the playable mesh and outskirts. */
export function naturalTerrainMaterial(terrain: TerrainUniforms = sharedTerrain) {
  const material = Object.assign(new MeshStandardMaterial({ roughness: .96, metalness: 0, fog: false }), {
    // The regional relief has no local snowbed or scoured shoulder.
    defaultAttributeValues: { passArt: [0, 0, 0] },
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, terrain);
    shader.vertexShader = 'attribute vec3 passArt;\n' + varyings + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vPassArt = passArt;
      vTerrainWorld = (modelMatrix * vec4(transformed, 1.)).xyz;
      vTerrainNormal = mat3(modelMatrix) * objectNormal;`);
    shader.fragmentShader = varyings + terrainFunctions + skyBaseGlsl + terrainHazeGlsl
      + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = terrainAlbedo(vTerrainWorld, normalize(vTerrainNormal));`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          reflectedLight.directDiffuse *= 1. - .94 * vPassArt.y;
          reflectedLight.indirectDiffuse *= mix(vec3(1.), vec3(.65, .76, .94), vPassArt.y);`)
        .replace('#include <colorspace_fragment>', `
        gl_FragColor.rgb = aerated(gl_FragColor.rgb, vTerrainWorld, cameraPosition);
        #include <colorspace_fragment>`);
  };
  return material;
}

import { useEffect, useMemo } from 'react';
import { MeshBasicMaterial } from 'three';
import { HAZE, SEA_BODY, SKY, SKYLINE, glslRgb, glslVec3 } from './atmospherePalette';
import { makeSkyline } from './skylineData';

/** Fragment helpers: a cheap hash (an interleaved gradient noise chain, no sin) and the colours the foot mist and moss need. */
const prefix = /* glsl */`
varying vec3 vSky;
varying float vSeed;
const vec3 FOOT_SEA = ${glslRgb(SEA_BODY)};
const vec3 FOOT_HAZE = ${glslVec3(HAZE)};
const vec3 FOOT_LOW = ${glslVec3(SKY.low)};
const vec3 MOSS = ${glslVec3(SKYLINE.crown)};
const vec3 FOAM = ${glslVec3(SKYLINE.foam)};
float hash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
`;

/** Display-referred vertex colour (baked sun-lit and shaded faces, tower mood, a darker foot) and scene fog for the aerial
 * perspective, plus touches that cost a few ALU ops and no texture. The foot of a tower mists toward the colour the sea really has in
 * front of it (its teal body mirrored with the haze at that grazing angle), over a thin darker contact line, so it stands in the water
 * instead of sitting on a paler strip. Vertical faces get a window grid found from the face's own derivatives, varied per tower (the
 * vertex seed sets the bay width and floor height): a few dark or sky-bright panes, blocks of panes gone dark, an occasional dim floor,
 * and on the two nearest layers moss stains that drip from the top of a seven-floor block. It fades with distance and before it gets finer than a pixel, so near towers read as buildings and far ones
 * stay calm. The fog never takes a tower all the way (88 percent), so the farthest layer keeps a trace of its own colour against the
 * haze. `transformed` is world space because the mesh sits at the origin. No loops. */
export function skylineMaterial() {
  const material = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vSky;\nvarying float vSeed;\nattribute float aSeed;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSky = transformed;\nvSeed = aSeed;');
    shader.fragmentShader = prefix + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float layer = floor(vSeed), seed = vSeed - layer, yy = max(vSky.y - .1, 0.);
      diffuseColor.rgb *= 1. - .3 * (1. - smoothstep(.2, 2.4, yy)) * vec3(.9, .55, .65);
      vec3 toBase = cameraPosition - vec3(vSky.x, .1, vSky.z);
      float cosI = clamp(toBase.y / length(toBase), 0., 1.);
      vec3 sea = mix(FOOT_SEA, mix(FOOT_HAZE, FOOT_LOW, smoothstep(0., .17, cosI)), min(.025 + .65 * pow(1. - cosI, 4.), .85));
      diffuseColor.rgb = mix(diffuseColor.rgb, sea, exp(-yy * .2) * .7);
      diffuseColor.rgb = mix(diffuseColor.rgb, FOAM, (1. - smoothstep(.05, .5, yy)) * .5);
      vec3 face = normalize(cross(dFdx(vSky), dFdy(vSky)));
      vec2 bay = vec2(dot(vSky.xz, vec2(-face.z, face.x)) / (2.7 + 1.1 * seed), vSky.y / (3.6 + 1.1 * fract(seed * 7.31))), cell = floor(bay), fr = fract(bay);
      float pane = smoothstep(.1, .22, fr.x) * (1. - smoothstep(.78, .9, fr.x)) * smoothstep(.2, .34, fr.y) * (1. - smoothstep(.62, .78, fr.y));
      float walls = 1. - smoothstep(.3, .6, abs(face.y)), fine = 1. - smoothstep(.3, .7, max(fwidth(bay.x), fwidth(bay.y)));
      #ifdef USE_FOG
      float near = 1. - smoothstep(420., 640., vFogDepth);
      #else
      float near = 1.;
      #endif
      float grid = walls * fine * near, roll = hash(cell + seed * 61.);
      float dim = pane * (roll < .13 ? 1.9 : (roll > .93 ? -.7 : 1.)) + step(hash(vec2(cell.y, seed * 17.)), .1) * .6;
      dim += pane * step(hash(floor(cell / vec2(3., 2.)) + seed * 13.), .1) * 1.6;
      diffuseColor.rgb *= 1. - .17 * dim * grid * vec3(1.15, 1., .78);
      float tri = abs(fract(vSky.y / 4.5) - .5) * 2.;
      diffuseColor.rgb *= 1. - .1 * smoothstep(.4, .7, tri) * walls * (1. - grid);
      diffuseColor.rgb *= .86 + .16 * smoothstep(2., 90., yy);
      vec2 block = vec2(bay.x / 2., bay.y / 7.);
      float drip = step(.8, hash(floor(block) + seed * 29.)) * (1. - fract(block.y)) * smoothstep(0., .3, fract(block.x)) * (1. - smoothstep(.7, 1., fract(block.x)));
      diffuseColor.rgb = mix(diffuseColor.rgb, MOSS, .34 * drip * grid * (1. - step(1.5, layer)));`)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
      float f = smoothstep(fogNear, fogFar, vFogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, mix(f, pow(f, 1.6) * .8, smoothstep(.5, 14., vSky.y)));
      #endif`);
  };
  return material;
}

/** The distant skyline: one static mesh, one draw call, outside the flyable box, no collider, no shadow, nothing per frame. Built
 * and disposed with the Scene, which remounts after a context loss. */
export default function Skyline() {
  const sky = useMemo(makeSkyline, []), material = useMemo(skylineMaterial, []);
  useEffect(() => () => { sky.geometry.dispose(); material.dispose(); }, [sky, material]);
  return <mesh geometry={sky.geometry} material={material} frustumCulled={false} castShadow={false} receiveShadow={false} dispose={null} />;
}

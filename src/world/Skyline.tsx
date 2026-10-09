import { useEffect, useMemo } from 'react';
import { MeshBasicMaterial } from 'three';
import { HAZE, SEA_BODY, SKY, SKYLINE, glslRgb, glslVec3 } from './atmospherePalette';
import { makeSkyline } from './skylineData';

/** Fragment helpers: a cheap hash (an interleaved gradient noise chain, no sin) and the colours the foot mist, soot, rust and scum need. */
const prefix = /* glsl */`
varying vec3 vSky;
varying float vSeed;
varying float vWall;
const vec3 FOOT_SEA = ${glslRgb(SEA_BODY)};
const vec3 FOOT_HAZE = ${glslVec3(HAZE)};
const vec3 FOOT_LOW = ${glslVec3(SKY.low)};
const vec3 SOOT = ${glslVec3(SKYLINE.soot)};
const vec3 RUST = ${glslVec3(SKYLINE.rust)};
const vec3 SCUM = ${glslVec3(SKYLINE.foam)};
float hash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
`;

/** Display-referred vertex colour (baked lit and shaded faces, ruin mood, burned parts, darker low floors) and scene fog, plus touches
 * that cost a few ALU ops and no texture. The foot of a ruin mists toward the colour the poisoned water really has in front of it,
 * over a dark contact line and a band of scum. Wall faces (vWall) get a grid of empty window holes found from the face's own
 * derivatives, varied per ruin (the vertex seed sets the bay width and floor height): almost every hole is black, blocks of them are
 * blown into bigger openings, soot climbs the wall above burned floors, and rust bleeds down from the window sills. It fades with
 * distance and before it gets finer than a pixel, so near ruins read as gutted and far ones stay calm silhouettes. The ash haze takes
 * every ruin completely by the fog's far end. `transformed` is world space because the mesh sits at the origin. No loops. */
export function skylineMaterial() {
  const material = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vSky;\nvarying float vSeed;\nvarying float vWall;\nattribute float aSeed;\nattribute float aWall;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSky = transformed;\nvSeed = aSeed;\nvWall = aWall;');
    shader.fragmentShader = prefix + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float layer = floor(vSeed), seed = vSeed - layer, yy = max(vSky.y - .1, 0.);
      diffuseColor.rgb *= 1. - .45 * (1. - smoothstep(.2, 3., yy)) * vec3(.85, .8, .9);
      vec3 toBase = cameraPosition - vec3(vSky.x, .1, vSky.z);
      float cosI = clamp(toBase.y / length(toBase), 0., 1.);
      vec3 sea = mix(FOOT_SEA, mix(FOOT_HAZE, FOOT_LOW, smoothstep(0., .17, cosI)), min(.025 + .55 * pow(1. - cosI, 4.), .8));
      diffuseColor.rgb = mix(diffuseColor.rgb, sea, exp(-yy * .25) * .7);
      diffuseColor.rgb = mix(diffuseColor.rgb, SCUM, (1. - smoothstep(.05, .7, yy)) * .45);
      vec3 face = normalize(cross(dFdx(vSky), dFdy(vSky)));
      vec2 bay = vec2(dot(vSky.xz, vec2(-face.z, face.x)) / (2.7 + 1.1 * seed), vSky.y / (3.6 + 1.1 * fract(seed * 7.31))), cell = floor(bay), fr = fract(bay);
      float pane = smoothstep(.08, .2, fr.x) * (1. - smoothstep(.8, .92, fr.x)) * smoothstep(.16, .3, fr.y) * (1. - smoothstep(.66, .8, fr.y));
      float walls = vWall * (1. - smoothstep(.3, .6, abs(face.y))), fine = 1. - smoothstep(.3, .7, max(fwidth(bay.x), fwidth(bay.y)));
      #ifdef USE_FOG
      float near = 1. - smoothstep(300., 460., vFogDepth);
      #else
      float near = 1.;
      #endif
      float grid = walls * fine * near, roll = hash(cell + seed * 61.);
      float blast = step(hash(floor(cell / vec2(3., 2.)) + seed * 13.), .3);
      float hole = max(pane * (roll < .9 ? 1. : .35), blast * smoothstep(.0, .12, min(min(fr.x, 1. - fr.x), min(fr.y, 1. - fr.y)) + .1));
      diffuseColor.rgb = mix(diffuseColor.rgb, SOOT * .45, hole * grid * .92);
      float burned = step(hash(vec2(cell.y, seed * 17.)), .3), above = step(hash(vec2(cell.y - 1., seed * 17.)), .3);
      float plume = max(burned, above * (1. - fr.y)) * smoothstep(.0, .5, 1. - abs(fr.x - .5) * 2.);
      diffuseColor.rgb = mix(diffuseColor.rgb, SOOT, plume * walls * near * .75);
      float bleed = step(.72, hash(vec2(cell.x, seed * 29.))) * (1. - fr.y) * smoothstep(.35, .45, fr.x) * (1. - smoothstep(.55, .65, fr.x));
      diffuseColor.rgb = mix(diffuseColor.rgb, RUST, bleed * grid * (1. - pane) * .5);
      float tri = abs(fract(vSky.y / 3.7) - .5) * 2.;
      diffuseColor.rgb *= 1. - .12 * smoothstep(.45, .7, tri) * walls * (1. - grid);
      diffuseColor.rgb *= .84 + .16 * smoothstep(2., 60., yy);`)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
      float f = smoothstep(fogNear, fogFar, vFogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, mix(f, pow(f, 1.3), smoothstep(.5, 14., vSky.y)));
      #endif`);
  };
  return material;
}

/** The distant ruins: one static mesh, one draw call, outside the flyable box, no collider, no shadow, nothing per frame. Built
 * and disposed with the Scene, which remounts after a context loss. */
export default function Skyline() {
  const sky = useMemo(makeSkyline, []), material = useMemo(skylineMaterial, []);
  useEffect(() => () => { sky.geometry.dispose(); material.dispose(); }, [sky, material]);
  return <mesh geometry={sky.geometry} material={material} frustumCulled={false} castShadow={false} receiveShadow={false} dispose={null} />;
}

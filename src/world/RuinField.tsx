import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { Euler, MeshLambertMaterial, Quaternion, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { FRAME_GROUPS } from '@/game/combat';
import { SKYLINE, glslVec3 } from './atmospherePalette';
import { makeField } from './fieldData';

/** The flyable ruins' surface: the city's concrete photo under the baked ruin colours, lit by the scene (tone mapped like the city),
 * with the far skyline's cheap touches on wall faces (aWall): a grid of empty, black window holes, blown-out blocks, soot climbing
 * above burned floors and rust bleeding from the sills; a dark wet band and scum at the waterline. No loops, no extra textures. */
export function fieldMaterial(map: Texture) {
  const material = new MeshLambertMaterial({ vertexColors: true, map });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vRuin;\nvarying float vSeed;\nvarying float vWall;\nattribute float aSeed;\nattribute float aWall;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRuin = transformed;\nvSeed = aSeed;\nvWall = aWall;');
    shader.fragmentShader = `varying vec3 vRuin;\nvarying float vSeed;\nvarying float vWall;
const vec3 SOOT = ${glslVec3(SKYLINE.soot)};
const vec3 RUST = ${glslVec3(SKYLINE.rust)};
const vec3 SCUM = ${glslVec3(SKYLINE.foam)};
float hash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
` + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float seed = fract(vSeed), yy = max(vRuin.y - .1, 0.);
      vec3 face = normalize(cross(dFdx(vRuin), dFdy(vRuin)));
      vec2 bay = vec2(dot(vRuin.xz, vec2(-face.z, face.x)) / (2.7 + 1.1 * seed), vRuin.y / (3.6 + 1.1 * fract(seed * 7.31))), cell = floor(bay), fr = fract(bay);
      float pane = smoothstep(.08, .2, fr.x) * (1. - smoothstep(.8, .92, fr.x)) * smoothstep(.16, .3, fr.y) * (1. - smoothstep(.66, .8, fr.y));
      float walls = vWall * (1. - smoothstep(.3, .6, abs(face.y))), grid = walls * (1. - smoothstep(.3, .7, max(fwidth(bay.x), fwidth(bay.y))));
      float roll = hash(cell + seed * 61.), blast = step(hash(floor(cell / vec2(3., 2.)) + seed * 13.), .3);
      float hole = max(pane * (roll < .9 ? 1. : .35), blast * smoothstep(.0, .12, min(min(fr.x, 1. - fr.x), min(fr.y, 1. - fr.y)) + .1));
      diffuseColor.rgb = mix(diffuseColor.rgb, SOOT * .3, hole * grid * .93);
      float burned = step(hash(vec2(cell.y, seed * 17.)), .3), above = step(hash(vec2(cell.y - 1., seed * 17.)), .3);
      float plume = max(burned, above * (1. - fr.y)) * smoothstep(.0, .5, 1. - abs(fr.x - .5) * 2.);
      diffuseColor.rgb = mix(diffuseColor.rgb, SOOT, plume * walls * .7);
      float bleed = step(.72, hash(vec2(cell.x, seed * 29.))) * (1. - fr.y) * smoothstep(.35, .45, fr.x) * (1. - smoothstep(.55, .65, fr.x));
      diffuseColor.rgb = mix(diffuseColor.rgb, RUST, bleed * grid * (1. - pane) * .5);
      diffuseColor.rgb *= 1. - .5 * (1. - smoothstep(.2, 3., yy));
      diffuseColor.rgb = mix(diffuseColor.rgb, SCUM * .6, (1. - smoothstep(.05, .7, yy)) * .5);`);
  };
  return material;
}

/** The flyable ruins: four static meshes (frustum culled by quadrant) and their colliders, created straight in the Rapier world (a
 * couple of thousand cuboids would be a couple of thousand React components). Built and disposed with the Scene. */
export default function RuinField() {
  const field = useMemo(() => makeField(), []);
  const map = useLoader(TextureLoader, '/textures/environment/concrete_floor_02_diff_1k.jpg');
  const material = useMemo(() => {
    map.wrapS = map.wrapT = RepeatWrapping; map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
    return fieldMaterial(map);
  }, [map]);
  const { world, rapier } = useRapier();
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed()), q = new Quaternion();
    for (const s of field.solids) {
      q.setFromEuler(new Euler(...s.rotation));
      const desc = rapier.ColliderDesc.cuboid(...s.size).setTranslation(...s.position).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      if (s.kind === 'frame') desc.setCollisionGroups(FRAME_GROUPS);
      world.createCollider(desc, body);
    }
    // The Physics provider may already have freed its world when the whole Scene unmounts (context loss): nothing is left to remove.
    return () => { try { world.removeRigidBody(body); } catch { /* world already freed */ } };
  }, [world, rapier, field]);
  useEffect(() => () => { field.geometries.forEach(g => g.dispose()); material.dispose(); }, [field, material]);
  return <>{field.geometries.map((g, i) => <mesh key={i} geometry={g} material={material} receiveShadow castShadow={false} dispose={null} />)}</>;
}

import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { Euler, MeshLambertMaterial, Quaternion, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { FRAME_GROUPS } from '@/game/combat';
import { SKYLINE, glslVec3 } from './atmospherePalette';
import { makeField } from './fieldData';

/** The flyable field's surface: the stone photo under the baked basalt colours, lit by the scene
 * (tone mapped like the city), since the Dudael pass (Garo, 2026-10-21: the field is chasm terrain,
 * not apartment ruins). On wall faces (aWall): carved ashlar courses with dark seams, broad shadows
 * in alternating panels, molten bronze bleeding from the joints low down, ember glow and a molten
 * crust tideline at the waterline. No loops, no extra textures. */
export function fieldMaterial(map: Texture) {
  const material = new MeshLambertMaterial({ vertexColors: true, map });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vRuin;\nvarying float vSeed;\nvarying float vWall;\nattribute float aSeed;\nattribute float aWall;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRuin = transformed;\nvSeed = aSeed;\nvWall = aWall;');
    shader.fragmentShader = `varying vec3 vRuin;\nvarying float vSeed;\nvarying float vWall;
const vec3 SOOT = ${glslVec3(SKYLINE.soot)};
const vec3 RUST = ${glslVec3(SKYLINE.rust)};
const vec3 CRUST = ${glslVec3(SKYLINE.foam)};
float hash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
` + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float seed = fract(vSeed), yy = max(vRuin.y - .1, 0.);
      diffuseColor.rgb = mix(diffuseColor.rgb * vec3(.62, .47, .4), SOOT, .3);
      vec3 face = normalize(cross(dFdx(vRuin), dFdy(vRuin)));
      vec2 bay = vec2(dot(vRuin.xz, vec2(-face.z, face.x)) / (2.6 + 1.2 * seed), vRuin.y / 2.4), cell = floor(bay), fr = fract(bay);
      float walls = vWall * (1. - smoothstep(.3, .6, abs(face.y))), grid = walls * (1. - smoothstep(.3, .7, max(fwidth(bay.x), fwidth(bay.y))));
      float course = fract(bay.y), seam = smoothstep(.9, .96, course);
      float carved = step(hash(floor(cell / vec2(1., 2.)) + seed * 41.), .5) * smoothstep(.08, .2, fr.x) * (1. - smoothstep(.8, .92, fr.x));
      diffuseColor.rgb = mix(diffuseColor.rgb, SOOT * .55, (seam + carved * .55) * grid);
      float vein = step(.4, hash(vec2(floor(bay.x), floor(vRuin.y / 2.4)) + seed * 23.)) * (1. - smoothstep(4., 30., yy)) * seam;
      diffuseColor.rgb = mix(diffuseColor.rgb, RUST * 1.5, vein * grid * .85);
      diffuseColor.rgb *= 1. - .4 * (1. - smoothstep(.2, 3., yy));
      diffuseColor.rgb = mix(diffuseColor.rgb, CRUST * .8, (1. - smoothstep(.05, .9, yy)) * .5);
      diffuseColor.rgb = mix(diffuseColor.rgb, RUST * 1.9, (1. - smoothstep(0., 7., yy)) * .28 * walls);`);
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
  return <>{field.geometries.map((g, i) => <mesh key={i} geometry={g} material={material} receiveShadow castShadow dispose={null} />)}</>;
}

import { DISTRICT_URL } from './districtAsset';
import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2 } from 'three';

/** Blender-authored envelopes share texture maps; the city owns the flight colliders. */
export default function BlenderDistrict() {
  const gltf = useLoader(GLTFLoader, DISTRICT_URL, loader => loader.setMeshoptDecoder(MeshoptDecoder));
  const maps = useLoader(TextureLoader, [
    '/textures/environment/concrete_floor_02_diff_1k.jpg',
    '/textures/environment/concrete_floor_02_nor_gl_1k.jpg',
    '/textures/environment/concrete_floor_02_rough_1k.jpg',
  ]);
  const { scene, materials } = useMemo(() => {
    maps.forEach((map, i) => {
      map.wrapS = map.wrapT = RepeatWrapping; map.anisotropy = 4;
      if (i === 0) map.colorSpace = SRGBColorSpace;
    });
    const scene = gltf.scene.clone(true), materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const original = object.material as MeshStandardMaterial;
      let material = materials.get(original);
      if (!material) {
        material = original.clone(); materials.set(original, material);
        if (['concrete', 'chalk', 'oxide', 'ceramic'].includes(material.name)) {
          material.color.multiplyScalar(1.65);
          material.map = maps[0]; material.normalMap = maps[1]; material.roughnessMap = maps[2];
          material.normalScale = new Vector2(.75, .75);
          // Large-scale runoff complements the baked edge chips and small texture detail.
          material.onBeforeCompile = shader => {
            shader.vertexShader = 'varying vec3 vAge;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
              '#include <begin_vertex>\nvAge = (modelMatrix * vec4(position, 1.)).xyz;');
            shader.fragmentShader = 'varying vec3 vAge;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
              #include <color_fragment>
              float streak = pow(.5 + .5 * sin(vAge.x * 4.6 + vAge.z * 3.7), 12.);
              float runoff = streak * (.5 + .5 * sin(vAge.y * .21 + vAge.z));
              diffuseColor.rgb *= 1. - runoff * .28;
            `);
          };
        }
        if (material.name === 'glass') material.envMapIntensity = 1.55;
      }
      object.material = material; object.castShadow = true; object.receiveShadow = true;
    });
    return { scene, materials };
  }, [gltf, maps]);
  // Geometry and source textures belong to useLoader's cache; only clones are owned here.
  useEffect(() => () => materials.forEach(material => material.dispose()), [materials]);
  return <primitive object={scene} dispose={null} />;
}

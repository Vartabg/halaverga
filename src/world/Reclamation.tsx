import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Color, Euler, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { makeUnderstory, trees, type Plant } from './reclamationData';
import IvyCards from './IvyCards';

function Grove({ asset, plants }: { asset: string; plants: Plant[] }) {
  const gltf = useLoader(GLTFLoader, `/models/environment/${asset}.glb`);
  const meshes = useMemo(() => {
    const result: InstancedMesh[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object => {
      // Bare and charred: no leaves have grown since the light went.
      if (!(object instanceof Mesh) || (object.material as MeshStandardMaterial).name.includes('leaves')) return;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const material = (object.material as MeshStandardMaterial).clone();
      material.roughness = .9; material.metalness = 0;
      material.transparent = false; material.alphaTest = .45;
      material.emissive = new Color('#000000'); material.emissiveIntensity = 0;
      const mesh = new InstancedMesh(geometry, material, plants.length);
      const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(), q = new Quaternion();
      plants.forEach((plant, i) => {
        matrix.compose(position.fromArray(plant.position), q.setFromEuler(new Euler(0, plant.yaw, plant.tilt || 0)),
          scale.fromArray(plant.scale));
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, new Color().setRGB(.3 + (i % 3) * .04, .28 + (i % 4) * .03, .26 + (i % 3) * .03));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true;
      result.push(mesh);
    });
    return result;
  }, [gltf, plants]);
  useEffect(() => () => meshes.forEach(mesh => {
    mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); mesh.dispose();
  }), [meshes]);
  return <>{meshes.map((mesh, i) => <primitive key={i} object={mesh} />)}</>;
}
export default function Reclamation() {
  const understory = useMemo(makeUnderstory, []);
  return <><Grove asset="island_tree_01" plants={trees} /><IvyCards plants={understory} /></>;
}

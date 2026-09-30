import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { Color, DoubleSide, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry,
  Quaternion, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Plant } from './reclamationData';

export default function IvyCards({ plants }: { plants: Plant[] }) {
  const texture = useLoader(TextureLoader, '/textures/environment/ivy-card.png');
  const mesh = useMemo(() => {
    texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
    // The source is an atlas of nine separate plants. Use individual cells,
    // clustered with depth, rather than stretching the entire atlas into a bush.
    const cards = Array.from({ length: 27 }, (_, i) => {
      const card = new PlaneGeometry(.44, .88), uv = card.attributes.uv;
      const cell = i * 7 % 9;
      for (let v = 0; v < uv.count; v++) uv.setX(v, (cell + uv.getX(v)) / 9);
      card.rotateY(Math.sin(i * 2.4) * .45);
      card.translate((i % 9 - 4) * .27, .37 + Math.floor(i / 9) * .06, Math.sin(i * 1.6) * .2);
      return card;
    });
    const geometry = mergeGeometries(cards); cards.forEach(card => card.dispose());
    const material = new MeshStandardMaterial({ map: texture, alphaTest: .45, side: DoubleSide,
      roughness: .95, alphaToCoverage: true });
    const mesh = new InstancedMesh(geometry, material, plants.length * 2);
    const matrix = new Matrix4(), q = new Quaternion(), position = new Vector3(), scale = new Vector3();
    plants.forEach((plant, i) => {
      for (let layer = 0; layer < 2; layer++) {
        position.fromArray(plant.position); position.z += layer * .18;
        q.setFromEuler(new Euler(0, plant.yaw + (plant.tilt ? layer * .13 : layer * 1.2), plant.tilt || 0));
        matrix.compose(position, q, scale.fromArray(plant.scale)); mesh.setMatrixAt(i * 2 + layer, matrix);
        mesh.setColorAt(i * 2 + layer, new Color().setRGB(.82 + i % 3 * .06, .91 + i % 2 * .07, .78));
      }
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }, [texture, plants]);
  useEffect(() => () => { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}

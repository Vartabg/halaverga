import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Group, MathUtils, Mesh, Color, Float32BufferAttribute, type BufferGeometry, type MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
export default function Suit() {
  const root = useRef<Group>(null);
  const asset = useLoader(GLTFLoader, '/models/suit.glb');
  const geometry = useMemo(() => {
    const pieces: BufferGeometry[] = [];
    asset.scene.updateMatrixWorld(true);
    asset.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const color = (object.material as MeshStandardMaterial).color || new Color('white');
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geometry.deleteAttribute('uv'); geometry.deleteAttribute('tangent');
      pieces.push(geometry.toNonIndexed()); geometry.dispose();
    });
    const merged = mergeGeometries(pieces); pieces.forEach(p => p.dispose()); return merged;
  }, [asset]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, dt) => {
    if (!root.current) return;
    const state = useGame.getState();
    root.current.visible = state.camera === 'third';
    root.current.position.copy(runtime.position);
    root.current.rotation.y = runtime.yaw;
    root.current.rotation.x = MathUtils.damp(root.current.rotation.x, state.flying ? -Math.min(runtime.speed / 23, .95) : 0, 5, dt);
    root.current.rotation.z = MathUtils.damp(root.current.rotation.z, -runtime.touch.strafe * .22, 5, dt);
  });
  return <group ref={root}><mesh geometry={geometry} castShadow><meshToonMaterial vertexColors /></mesh>
    <pointLight position={[0, .2, .4]} color="#c2f9c8" intensity={.5} distance={2} />
  </group>;
}

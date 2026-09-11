import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Group, MeshToonMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { presentation as pose } from '@/game/presentation';
import { useGame } from '@/game/store';
import { buildSuitParts, pivots } from './suitGeometry';
export default function Suit() {
  const root = useRef<Group>(null), parts = useRef<(Group | null)[]>([]);
  const asset = useLoader(GLTFLoader, '/models/suit.glb');
  const geometry = useMemo(() => buildSuitParts(asset.scene), [asset]);
  const material = useMemo(() => new MeshToonMaterial({ vertexColors: true }), []);
  useEffect(() => () => { geometry.forEach(g => g.dispose()); material.dispose(); }, [geometry, material]);
  useFrame(() => {
    if (!root.current) return;
    root.current.visible = useGame.getState().camera === 'third';
    root.current.position.copy(pose.position);
    root.current.rotation.set(pose.lean, pose.yaw, pose.bank, 'YXZ');
    const head = parts.current[1];
    if (head) head.rotation.x = -pose.lean * .72;
    const streamline = Math.max(0, Math.min(1, (pose.speed - 3) / 25));
    for (let i = 2; i <= 3; i++) {
      const arm = parts.current[i], side = i === 2 ? -1 : 1;
      if (!arm) continue;
      arm.rotation.x = pose.flight * .18 - pose.brake * .25;
      arm.rotation.z = side * (pose.flight * (.2 - streamline * .3) + pose.brake * .35);
    }
    for (let i = 4; i <= 5; i++) {
      const leg = parts.current[i]; if (leg) leg.rotation.x = pose.flight * .14 + pose.brake * .28;
    }
  }, -20);
  return <group ref={root}>
    {geometry.map((g, i) => <group key={i} ref={node => { parts.current[i] = node; }} position={[...pivots[i]]}>
      <mesh geometry={g} material={material} castShadow /></group>)}
    <pointLight position={[0, .2, .4]} color="#c2f9c8" intensity={.5} distance={2} />
  </group>;
}

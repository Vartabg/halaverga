'use client';
import { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Group, Mesh, MeshBasicMaterial, Object3D, RingGeometry } from 'three';
import { SemjazaBoss, updateSemjaza } from '@/game/semjazaBoss';
import { DarkRune, generateRunes, updateRunes } from '@/game/semjazaAttacks';
import { runtime } from '@/game/runtime';

export const SEMJAZA_URL = '/models/semjaza.glb';

export default function SemjazaGLB({ boss }: { boss: SemjazaBoss }) {
  const root = useRef<Group>(null);
  const staffRef = useRef<Object3D | null>(null);
  const wingsLeft = useRef<Object3D[]>([]);
  const wingsRight = useRef<Object3D[]>([]);
  const runes = useRef<DarkRune[]>([]);

  const gltf = useLoader(GLTFLoader, SEMJAZA_URL);
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    // Locate articulated nodes
    staffRef.current = clone.getObjectByName('Semjaza_Staff') ?? null;
    wingsLeft.current = [
      clone.getObjectByName('Wing_L1'),
      clone.getObjectByName('Wing_L2'),
      clone.getObjectByName('Wing_L3'),
    ].filter(Boolean) as Object3D[];
    wingsRight.current = [
      clone.getObjectByName('Wing_R1'),
      clone.getObjectByName('Wing_R2'),
      clone.getObjectByName('Wing_R3'),
    ].filter(Boolean) as Object3D[];
    return clone;
  }, [gltf]);

  const runeGeo = useMemo(() => new RingGeometry(0.1, 2.8, 16), []);
  const runeMat = useMemo(() => new MeshBasicMaterial({ color: 0x6e2b9e, transparent: true, opacity: 0.65 }), []);

  useFrame((_, dt) => {
    if (!root.current) return;
    const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z;
    updateSemjaza(boss, dt, px, py, pz);

    // Position and facing
    root.current.position.set(boss.x, boss.y, boss.z);
    root.current.rotation.y = boss.yaw;

    // Posture stagger reaction: kneel and droop
    if (boss.state === 'stagger') {
      root.current.position.y = Math.max(0, boss.y - 1.2);
      root.current.rotation.x = 0.25; // Forward slump
    } else {
      root.current.rotation.x = 0;
    }

    // Wing flapping animation
    const flapSpeed = boss.phase === 2 ? 6.0 : 3.5;
    const flapAngle = Math.sin(boss.timer * flapSpeed) * 0.35;
    for (let i = 0; i < wingsLeft.current.length; i++) {
      wingsLeft.current[i].rotation.y = flapAngle * (1 + i * 0.15);
      wingsLeft.current[i].rotation.z = Math.cos(boss.timer * flapSpeed) * 0.1;
    }
    for (let i = 0; i < wingsRight.current.length; i++) {
      wingsRight.current[i].rotation.y = -flapAngle * (1 + i * 0.15);
      wingsRight.current[i].rotation.z = -Math.cos(boss.timer * flapSpeed) * 0.1;
    }

    // Staff cleave animation
    if (staffRef.current) {
      if (boss.state === 'cleave') {
        const sweep = Math.sin(boss.timer * Math.PI * 1.5);
        staffRef.current.rotation.z = -0.4 + sweep * 1.4;
        staffRef.current.rotation.y = sweep * 0.9;
      } else {
        staffRef.current.rotation.set(0, 0, 0);
      }
    }

    // Rune generation
    if (boss.state === 'glyphs' && boss.timer < 0.1) {
      runes.current = generateRunes(boss.x, boss.y, boss.z, px, pz);
    }
    updateRunes(runes.current, dt);
  });

  if (boss.state === 'defeated') return null;

  return (
    <>
      <group ref={root} position={[boss.x, boss.y, boss.z]} dispose={null}>
        <primitive object={model} />
      </group>

      {/* Ground Rune Circles */}
      {runes.current.map((r, i) => (
        <mesh
          key={i}
          geometry={runeGeo}
          material={runeMat}
          position={[r.x, r.y + 0.05, r.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}
    </>
  );
}

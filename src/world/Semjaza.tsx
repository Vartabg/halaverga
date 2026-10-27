'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, RingGeometry } from 'three';
import { SemjazaBoss, updateSemjaza } from '@/game/semjazaBoss';
import { DarkRune, generateRunes, updateRunes } from '@/game/semjazaAttacks';
import { buildSemjazaBody, buildSemjazaStaff } from './semjazaMesh';
import { buildSemjazaWings } from './semjazaWings';
import { runtime } from '@/game/runtime';

export default function Semjaza({ boss }: { boss: SemjazaBoss }) {
  const root = useRef<Group>(null);
  const staffRef = useRef<Mesh>(null);
  const runes = useRef<DarkRune[]>([]);

  // Geometries
  const bodyGeo = useMemo(() => buildSemjazaBody(), []);
  const staffGeo = useMemo(() => buildSemjazaStaff(), []);
  const wingsGeo = useMemo(() => buildSemjazaWings(), []);
  const runeGeo = useMemo(() => new RingGeometry(0.1, 2.8, 16), []);

  // Materials
  const armorMat = useMemo(() => new MeshStandardMaterial({ color: 0x1c1829, roughness: 0.45, metalness: 0.6 }), []);
  const clothMat = useMemo(() => new MeshStandardMaterial({ color: 0x2b1e38, roughness: 0.8, metalness: 0.1 }), []);
  const goldMat = useMemo(() => new MeshStandardMaterial({ color: 0xd4a03b, roughness: 0.3, metalness: 0.85 }), []);
  const runeMat = useMemo(() => new MeshBasicMaterial({ color: 0x6e2b9e, transparent: true, opacity: 0.65 }), []);

  useFrame((_, dt) => {
    if (!root.current) return;
    const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z;
    updateSemjaza(boss, dt, px, py, pz);

    // Update root transform
    root.current.position.set(boss.x, boss.y, boss.z);
    root.current.rotation.y = boss.yaw;

    // Staff cleave animation
    if (staffRef.current) {
      if (boss.state === 'cleave') {
        const sweep = Math.sin(boss.timer * Math.PI * 1.5);
        staffRef.current.rotation.z = -0.4 + sweep * 1.2;
        staffRef.current.rotation.y = sweep * 0.8;
      } else {
        staffRef.current.rotation.set(0, 0, 0);
      }
    }

    // Rune generation on glyphs state
    if (boss.state === 'glyphs' && boss.timer < 0.1) {
      runes.current = generateRunes(boss.x, boss.y, boss.z, px, pz);
    }
    updateRunes(runes.current, dt);
  });

  if (boss.state === 'defeated') return null;

  return (
    <>
      <group ref={root} position={[boss.x, boss.y, boss.z]} dispose={null}>
        {/* Main Body */}
        <mesh geometry={bodyGeo} material={armorMat} castShadow />
        {/* Six Seraphic Wings */}
        <mesh geometry={wingsGeo} material={clothMat} />
        {/* Staff */}
        <mesh ref={staffRef} geometry={staffGeo} material={goldMat} position={[-1.1, 0, 0.4]} />
      </group>

      {/* Ground Rune Circles */}
      {runes.current.map((r, i) => (
        <mesh key={i} geometry={runeGeo} material={runeMat} position={[r.x, r.y + 0.05, r.z]} rotation={[-Math.PI / 2, 0, 0]} />
      ))}
    </>
  );
}

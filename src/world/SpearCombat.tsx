'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, RingGeometry } from 'three';
import { SpearCombatState, updateSpearCombat } from '@/game/spearCombat';
import { SpearProjectile, updateSpearProjectile } from '@/game/spearThrow';
import { SemjazaBoss, damageSemjaza } from '@/game/semjazaBoss';
import { buildSpearMesh, buildAttackArc } from './spearMesh';
import { runtime } from '@/game/runtime';

export default function SpearCombat({
  combat,
  spear,
  boss,
}: {
  combat: SpearCombatState;
  spear: SpearProjectile;
  boss: SemjazaBoss;
}) {
  const root = useRef<Group>(null);
  const arcRef = useRef<Mesh>(null);
  const smiteRingRef = useRef<Mesh>(null);

  const spearGeo = useMemo(() => buildSpearMesh(), []);
  const arcGeo = useMemo(() => buildAttackArc(), []);
  const ringGeo = useMemo(() => new RingGeometry(0.5, 3.8, 24), []);

  const spearMat = useMemo(() => new MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.2, metalness: 0.85 }), []);
  const arcMat = useMemo(() => new MeshBasicMaterial({ color: 0xf2b84b, transparent: true, opacity: 0.8 }), []);
  const ringMat = useMemo(() => new MeshBasicMaterial({ color: 0xffd97d, transparent: true, opacity: 0.7 }), []);

  useFrame((_, dt) => {
    updateSpearCombat(combat, dt);
    const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z;
    const { hitBoss } = updateSpearProjectile(spear, dt, px, py, pz, boss.x, boss.y, boss.z);
    if (hitBoss) {
      damageSemjaza(boss, 85);
    }

    if (root.current) {
      if (spear.active) {
        root.current.position.set(spear.x, spear.y, spear.z);
      } else {
        // Held in hand alongside archangel
        root.current.position.set(px + 0.45, py + 0.2, pz + 0.35);
        root.current.rotation.set(0.3, 0, -0.4);
      }
    }

    if (arcRef.current) {
      arcRef.current.visible = combat.comboStep > 0 && combat.comboTimer < 0.22;
      arcRef.current.position.set(px, py + 0.5, pz);
    }

    if (smiteRingRef.current) {
      smiteRingRef.current.visible = combat.diveSmiteActive;
      if (combat.diveSmiteActive) {
        smiteRingRef.current.position.set(px, py + 0.05, pz);
        combat.diveSmiteActive = false; // single frame ring burst
      }
    }
  });

  return (
    <>
      {/* Spear Model */}
      <group ref={root} dispose={null}>
        <mesh geometry={spearGeo} material={spearMat} />
      </group>

      {/* Melee Light Sweep Arc */}
      <mesh ref={arcRef} geometry={arcGeo} material={arcMat} visible={false} />

      {/* Dive Smite Shockwave Ring */}
      <mesh ref={smiteRingRef} geometry={ringGeo} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} visible={false} />
    </>
  );
}

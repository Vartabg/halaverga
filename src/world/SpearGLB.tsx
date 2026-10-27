'use client';
import { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { SpearCombatState, updateSpearCombat } from '@/game/spearCombat';
import { SpearProjectile, updateSpearProjectile } from '@/game/spearThrow';
import { SemjazaBoss, applyStagger, damageSemjaza } from '@/game/semjazaBoss';
import { buildAttackArc } from './spearMesh';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { stepHitstop, applyHitstop } from '@/game/hitstop';
import { resolveMeleeHit } from '@/game/spearMelee';
import { addTrauma, punchFov } from '@/game/cameraFx';

export const SPEAR_URL = '/models/spear.glb';

export default function SpearGLB({
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

  const gltf = useLoader(GLTFLoader, SPEAR_URL);
  const model = useMemo(() => gltf.scene.clone(true), [gltf]);

  const arcGeo = useMemo(() => buildAttackArc(), []);
  const ringGeo = useMemo(() => new RingGeometry(0.5, 3.8, 24), []);

  const arcMat = useMemo(() => new MeshBasicMaterial({ color: 0xf2b84b, transparent: true, opacity: 0.85 }), []);
  const ringMat = useMemo(() => new MeshBasicMaterial({ color: 0xffd97d, transparent: true, opacity: 0.75 }), []);

  useFrame((_, dt) => {
    const paused = useGame.getState().paused;
    const frozen = stepHitstop(dt, paused);
    const combatDt = frozen ? 0 : dt;

    updateSpearCombat(combat, combatDt);

    // Authoritative melee collision check
    const meleeRes = resolveMeleeHit();
    if (meleeRes.hit) {
      addTrauma(runtime.shooter.camFx, meleeRes.smite ? 0.6 : meleeRes.postureBroken ? 0.7 : 0.35);
      punchFov(runtime.shooter.camFx, 'shot', meleeRes.smite ? 3.0 : 1.5);
    }

    const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z;
    const { hitBoss } = updateSpearProjectile(spear, combatDt, px, py, pz, boss.x, boss.y, boss.z);
    if (hitBoss) {
      applyStagger(boss, 20);
      damageSemjaza(boss, 85);
      applyHitstop(0.08);
      addTrauma(runtime.shooter.camFx, 0.4);
      punchFov(runtime.shooter.camFx, 'shot', 2.0);
    }

    if (root.current) {
      if (spear.active) {
        root.current.position.set(spear.x, spear.y, spear.z);
        root.current.rotation.set(spear.vx * 0.04, 0, spear.vz * 0.04);
      } else {
        // Held by player
        root.current.position.set(px + 0.45, py + 0.2, pz + 0.35);
        if (combat.attacking) {
          const t = combat.attackTimer / 0.35;
          const arc = Math.sin(t * Math.PI);
          if (combat.combo === 1) {
            root.current.rotation.set(0.3, arc * 1.5, -0.4);
          } else if (combat.combo === 2) {
            root.current.position.z += arc * 0.8;
            root.current.rotation.set(0.1, 0, -0.2);
          } else {
            root.current.rotation.set(0.3 + arc * 1.8, 0, -0.4);
          }
        } else {
          root.current.rotation.set(0.3, 0, -0.4);
        }
      }
    }

    if (arcRef.current) {
      arcRef.current.visible = combat.attacking && combat.attackTimer < 0.22;
      arcRef.current.position.set(px, py + 0.5, pz);
    }

    if (smiteRingRef.current) {
      smiteRingRef.current.visible = combat.diveSmiteActive;
      if (combat.diveSmiteActive) {
        smiteRingRef.current.position.set(px, py + 0.05, pz);
        combat.diveSmiteActive = false;
      }
    }
  });

  return (
    <>
      <group ref={root} dispose={null}>
        <primitive object={model} />
      </group>

      {/* Melee Light Sweep Arc */}
      <mesh ref={arcRef} geometry={arcGeo} material={arcMat} visible={false} />

      {/* Dive Smite Shockwave Ring */}
      <mesh
        ref={smiteRingRef}
        geometry={ringGeo}
        material={ringMat}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      />
    </>
  );
}

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { type Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { stepGowFrame } from '@/game/gowEnemies';
import { useGowInput } from '@/game/gowInput';
import { GOW_URL, gowRuntime } from '@/game/gowTypes';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { stepArchangelWings } from './archangelWings';
import { createGowArena, selectEnemyClip } from './gowArenaBuilder';

export default function GowArena() {
  useGowInput();
  const asset = useLoader(GLTFLoader, GOW_URL);
  const rootRef = useRef<Group>(null);

  const arena = useMemo(
    () => createGowArena(asset.scene, asset.animations),
    [asset],
  );

  useEffect(() => () => arena.dispose(), [arena]);

  useFrame((_three, rawDt) => {
    const state = useGame.getState();
    const visible = state.started && state.shooter;
    arena.container.visible = visible;
    if (!visible) return;

    if (!state.paused) {
      stepGowFrame(rawDt, state.reduced);
    }

    const dt = state.paused || gowRuntime.hitstopTimer > 0 ? 0 : Math.min(0.1, rawDt);
    const enemyTimeScale = gowRuntime.realmShiftTimer > 0 ? 0.28 : 1;

    for (let i = 0; i < arena.instances.length; i++) {
      const inst = arena.instances[i];
      const e = gowRuntime.enemies[i];
      if (!e) continue;

      inst.wrapper.position.set(e.x, e.y, e.z);
      inst.wrapper.rotation.y = e.yaw;

      const { clip, speed } = selectEnemyClip(e);
      if (inst.activeClip !== clip) {
        const prev = inst.activeClip ? inst.actions.get(inst.activeClip) : undefined;
        const next = inst.actions.get(clip);
        if (next) {
          next.reset();
          next.setEffectiveTimeScale(speed);
          next.setEffectiveWeight(1);
          next.play();
          if (prev && prev !== next) prev.crossFadeTo(next, 0.12, false);
          inst.activeClip = clip;
        }
      }
      inst.mixer.update(dt * enemyTimeScale);

      if (inst.wings) {
        stepArchangelWings(
          inst.wings,
          e.state !== 'dead',
          state.paused,
          state.reduced,
          e.state === 'chase' ? 4 : 0,
          0,
          0,
          dt,
          0,
          e.state === 'windup_red',
        );
      }

      const isYellow = e.state === 'windup_yellow';
      const isRed = e.state === 'windup_red' || e.state === 'windup_spell';
      inst.telegraphRing.visible = isYellow || isRed;
      if (isYellow || isRed) {
        inst.telegraphMat.color.set(isYellow ? '#ffd166' : '#ff3b30');
        inst.telegraphMat.opacity = 0.72;
        const pulse = Math.max(0.45, 1.45 - e.stateTimer * 0.9);
        inst.telegraphRing.scale.setScalar(e.scale * pulse);
      }

      const isExecutable =
        e.state === 'stunned' || (e.state === 'stagger' && e.stun >= e.maxStun) || isYellow;
      inst.stunBeacon.visible = isExecutable;
      if (isExecutable) {
        inst.stunBeacon.rotation.y += dt * 4.2;
      }

      const flash = e.flashTimer > 0 ? 2.2 : e.isBoss ? 0.65 : 0.35;
      for (const m of inst.handle.flashMaterials) m.emissiveIntensity = flash;
    }

    for (let i = 0; i < gowRuntime.projectiles.length; i++) {
      const p = gowRuntime.projectiles[i];
      const mesh = arena.projMeshes[i];
      mesh.visible = p.active;
      if (p.active) {
        mesh.position.set(p.x, p.y, p.z);
        mesh.material = p.fromPlayer ? arena.playerProjMat : arena.enemyProjMat;
      }
    }

    for (let i = 0; i < gowRuntime.sparks.length; i++) {
      const s = gowRuntime.sparks[i];
      const mesh = arena.sparkMeshes[i];
      mesh.visible = s.active;
      if (s.active) {
        mesh.position.set(s.x, s.y, s.z);
        mesh.rotation.x += dt * 12;
        mesh.rotation.y += dt * 9;
        mesh.scale.setScalar(Math.max(0.2, (s.life / s.maxLife) * 1.45));
      }
    }

    arena.slashMesh.visible = gowRuntime.slashTimer > 0 && !state.reduced;
    if (arena.slashMesh.visible) {
      const p = 1 - gowRuntime.slashTimer / Math.max(0.08, gowRuntime.slashDuration);
      arena.slashMesh.position.set(runtime.position.x, runtime.position.y + 0.15, runtime.position.z);
      arena.slashMesh.rotation.set(
        -Math.PI * 0.5 + gowRuntime.slashTilt,
        runtime.yaw + (p - 0.5) * 1.65 + gowRuntime.slashSpin * p * Math.PI * 2,
        gowRuntime.slashTilt * 0.6,
      );
      arena.slashMesh.scale.setScalar(0.88 + p * 0.36);
      arena.slashMat.color.set(gowRuntime.slashColor);
      arena.slashMat.opacity = Math.max(0, (1 - p) * 0.88);
    }

    const locked = gowRuntime.enemies.find(
      (e) => e.id === gowRuntime.lockedTargetId && e.state !== 'dead',
    );
    arena.lockRing.visible = Boolean(locked);
    if (locked) {
      arena.lockRing.position.set(locked.x, locked.y + 0.06, locked.z);
      arena.lockRing.rotation.z += dt * 2.4;
      arena.lockRing.scale.setScalar(locked.scale);
    }

    arena.shockMesh.visible = gowRuntime.shockwaveTimer > 0;
    if (gowRuntime.shockwaveTimer > 0) {
      const progress = 1 - gowRuntime.shockwaveTimer / 0.55;
      arena.shockMesh.position.set(gowRuntime.shockwaveX, 20.12, gowRuntime.shockwaveZ);
      arena.shockMesh.scale.setScalar(1 + progress * 5.8);
      arena.shockMat.color.set(gowRuntime.shockwaveColor);
      arena.shockMat.opacity = Math.max(0, (1 - progress) * 0.85);
    }
  }, -18);

  return <primitive ref={rootRef} object={arena.container} dispose={null} />;
}

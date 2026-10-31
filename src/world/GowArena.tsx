'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group } from 'three';
import { stepGowFrame } from '@/game/gowEnemies';
import { resetGowState } from '@/game/gowCombat';
import { useGowInput } from '@/game/gowInput';
import { switchDemoMode } from '@/game/gowPrototypeLab';
import { gowRuntime, type DemoMode } from '@/game/gowTypes';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { createGowArena } from './gowArenaBuilder';

export default function GowArena() {
  useGowInput();
  const rootRef = useRef<Group>(null);
  const lastEpoch = useRef(runtime.poseEpoch);
  const phaseRef = useRef(0);

  const arena = useMemo(() => createGowArena(), []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('demo');
      if (q === 'clash' || q === 'sigil' || q === 'dive') switchDemoMode(q as DemoMode);
    }
    return () => arena.dispose();
  }, [arena]);

  useFrame((_three, rawDt) => {
    const state = useGame.getState();
    if (runtime.poseEpoch !== lastEpoch.current) {
      lastEpoch.current = runtime.poseEpoch;
      const keepMode = gowRuntime.demoMode;
      resetGowState();
      if (keepMode !== 'clash') switchDemoMode(keepMode);
    }
    const visible = state.started && state.shooter;
    arena.container.visible = visible;
    if (!visible) return;

    if (!state.paused) stepGowFrame(rawDt, state.reduced);

    const dt = state.paused || gowRuntime.hitstopTimer > 0 ? 0 : Math.min(0.1, rawDt);
    const enemyTimeScale = gowRuntime.realmShiftTimer > 0 ? 0.28 : 1;
    phaseRef.current += dt * enemyTimeScale * 4.5;

    for (let i = 0; i < arena.instances.length; i++) {
      const inst = arena.instances[i], e = gowRuntime.enemies[i];
      if (!e) continue;
      inst.wrapper.position.set(e.x, e.y, e.z);
      inst.wrapper.rotation.set(0, 0, 0);

      const isDead = e.state === 'dead';
      inst.wrapper.visible = !isDead || e.stateTimer < 0.85;

      const isWindupOrStrike = e.state === 'windup_yellow' || e.state === 'windup_red' || e.state === 'windup_spell' || e.state === 'strike';
      const frame = isWindupOrStrike ? 1 : 0;
      const flip = runtime.position.x < e.x - 0.15;
      const useP2 = e.isBoss && (gowRuntime.phase2Awakened || (gowRuntime.demoMode === 'sigil' && !gowRuntime.oathTethers[0] && !gowRuntime.oathTethers[1])) && Boolean(arena.bossPhase2Tex.image);
      const activeTex = useP2 ? arena.bossPhase2Tex : inst.tex;
      if (inst.spriteMat.map !== activeTex) { inst.spriteMat.map = activeTex; inst.spriteMat.needsUpdate = true; }
      activeTex.repeat.set(flip ? -0.5 : 0.5, 1);
      activeTex.offset.set(frame * 0.5 + (flip ? 0.5 : 0), 0);

      const bob = state.reduced ? 0 : e.state === 'chase' ? Math.abs(Math.sin(phaseRef.current + i * 1.7)) * 0.14 : Math.sin(phaseRef.current * 0.45 + i) * 0.04;
      const baseH = e.isBoss ? 2.35 : 1.65;
      const tiltZ = isDead ? 1.25 : e.state === 'stagger' || e.state === 'stunned' ? (flip ? -0.18 : 0.18) : isWindupOrStrike ? (flip ? 0.12 : -0.12) : 0;
      inst.sprite.position.set(0, baseH + bob, 0);
      inst.sprite.rotation.set(-0.52, 0, tiltZ);

      if (e.flashTimer > 0) inst.spriteMat.color.set('#fff4b8');
      else if (e.state === 'stunned') inst.spriteMat.color.set('#ffd166');
      else if (isWindupOrStrike) inst.spriteMat.color.set('#ffd6cc');
      else inst.spriteMat.color.set('#ffffff');

      const isYellow = e.state === 'windup_yellow', isRed = e.state === 'windup_red' || e.state === 'windup_spell';
      inst.telegraphRing.visible = isYellow || isRed;
      if (isYellow || isRed) {
        inst.telegraphMat.color.set(isYellow ? '#ffd166' : '#ff3b30');
        inst.telegraphMat.opacity = 0.78;
        inst.telegraphRing.scale.setScalar(e.scale * Math.max(0.45, 1.45 - e.stateTimer * 0.9));
      }

      const isExecutable = e.state === 'stunned' || (e.state === 'stagger' && e.stun >= e.maxStun) || isYellow;
      inst.stunBeacon.visible = isExecutable;
      if (isExecutable) inst.stunBeacon.rotation.y += dt * 4.2;
    }

    for (let i = 0; i < gowRuntime.projectiles.length; i++) {
      const p = gowRuntime.projectiles[i], mesh = arena.projMeshes[i];
      mesh.visible = p.active;
      if (p.active) { mesh.position.set(p.x, p.y, p.z); mesh.material = p.fromPlayer ? arena.playerProjMat : arena.enemyProjMat; }
    }

    for (let i = 0; i < gowRuntime.sparks.length; i++) {
      const s = gowRuntime.sparks[i], mesh = arena.sparkMeshes[i];
      mesh.visible = s.active;
      if (s.active) {
        mesh.position.set(s.x, s.y, s.z); mesh.rotation.x += dt * 12; mesh.rotation.y += dt * 9;
        mesh.scale.setScalar(Math.max(0.2, (s.life / s.maxLife) * 1.45));
      }
    }

    arena.slashMesh.visible = gowRuntime.slashTimer > 0 && !state.reduced;
    if (arena.slashMesh.visible) {
      const p = 1 - gowRuntime.slashTimer / Math.max(0.08, gowRuntime.slashDuration);
      arena.slashMesh.position.set(runtime.position.x, runtime.position.y + 0.15, runtime.position.z);
      arena.slashMesh.rotation.set(-Math.PI * 0.5 + gowRuntime.slashTilt, runtime.yaw + (p - 0.5) * 1.65 + gowRuntime.slashSpin * p * Math.PI * 2, gowRuntime.slashTilt * 0.6);
      arena.slashMesh.scale.setScalar(0.95 + p * 0.42);
      arena.slashMat.color.set(gowRuntime.slashColor);
      arena.slashMat.opacity = Math.max(0, (1 - p) * 0.9);
    }

    const locked = gowRuntime.enemies.find((e) => e.id === gowRuntime.lockedTargetId && e.state !== 'dead');
    arena.lockRing.visible = Boolean(locked);
    if (locked) {
      arena.lockRing.position.set(locked.x, 20.06, locked.z);
      arena.lockRing.rotation.z += dt * 2.4;
      arena.lockRing.scale.setScalar(locked.isBoss ? 1.85 : 1.18);
    }

    const boss = gowRuntime.enemies[2];
    if (gowRuntime.sigilRibbonTimer > 0) {
      const dx = gowRuntime.sigilEndX - gowRuntime.sigilStartX, dz = gowRuntime.sigilEndZ - gowRuntime.sigilStartZ, len = Math.max(0.8, Math.hypot(dx, dz));
      arena.kbLineMesh.visible = true; arena.kbLineMat.color.set('#5ee6d0');
      arena.kbLineMesh.position.set((gowRuntime.sigilStartX + gowRuntime.sigilEndX) * 0.5, 20.09, (gowRuntime.sigilStartZ + gowRuntime.sigilEndZ) * 0.5);
      arena.kbLineMesh.rotation.set(-Math.PI * 0.5, 0, -Math.atan2(dz, dx));
      arena.kbLineMesh.scale.set(len, 1.3, 1);
    } else if (gowRuntime.demoMode === 'clash' && locked && gowRuntime.turnPhase === 'PLAYER_TURN') {
      const tx = !locked.isBoss && boss && boss.state !== 'dead' ? boss.x : locked.x + (locked.x - runtime.position.x) * 0.6;
      const tz = !locked.isBoss && boss && boss.state !== 'dead' ? boss.z : locked.z + (locked.z - runtime.position.z) * 0.6;
      const dx = tx - locked.x, dz = tz - locked.z, len = Math.max(1.5, Math.hypot(dx, dz));
      arena.kbLineMesh.visible = true; arena.kbLineMat.color.set('#ff9f1c');
      arena.kbLineMesh.position.set(locked.x + dx * 0.5, 20.08, locked.z + dz * 0.5);
      arena.kbLineMesh.rotation.set(-Math.PI * 0.5, 0, -Math.atan2(dz, dx));
      arena.kbLineMesh.scale.set(len, 1, 1);
    } else arena.kbLineMesh.visible = false;

    for (const idx of [0, 1] as const) {
      const tm = arena.tetherMeshes[idx], g = gowRuntime.enemies[idx];
      const showTether = gowRuntime.demoMode === 'sigil' && gowRuntime.oathTethers[idx] && g && g.state !== 'dead' && boss && boss.state !== 'dead';
      tm.visible = Boolean(showTether);
      if (showTether && g && boss) {
        const dx = boss.x - g.x, dz = boss.z - g.z, len = Math.max(0.5, Math.hypot(dx, dz));
        tm.position.set((g.x + boss.x) * 0.5, 20.1, (g.z + boss.z) * 0.5);
        tm.rotation.set(-Math.PI * 0.5, 0, -Math.atan2(dz, dx));
        tm.scale.set(len, 1, 1);
      }
    }

    arena.prismMesh.visible = gowRuntime.sigilPrism || gowRuntime.divePhase === 'BREACH_AIM';
    if (arena.prismMesh.visible) {
      if (gowRuntime.divePhase === 'BREACH_AIM') arena.prismMesh.position.set(0, 20.09, 56.5);
      else arena.prismMesh.position.set(runtime.position.x, 20.09, runtime.position.z);
      arena.prismMesh.rotation.z += dt * 1.8;
    }

    arena.cursorRing.visible = gowRuntime.cursorActiveTimer > 0;
    if (arena.cursorRing.visible) arena.cursorRing.position.set(gowRuntime.cursorWorldX, 20.05, gowRuntime.cursorWorldZ);

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

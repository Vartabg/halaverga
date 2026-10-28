import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findFreeflowTarget,
  resetGowState,
  triggerDodgeRoll,
  triggerHeavyBash,
  triggerLightAttack,
  triggerParry,
  triggerRunicSpell,
  triggerStunExecute,
  triggerWingedRage,
} from '@/game/gowCombat';
import { stepGowFrame } from '@/game/gowEnemies';
import { GOW_CLIPS, gowRuntime } from '@/game/gowTypes';
import { advanceVelocity, combatMotion } from '@/game/motion';
import { runtime } from '@/game/runtime';

const ROOT = resolve(__dirname, '..');

describe('God of War 65-bone Archangel GLB asset pipeline', () => {
  it('bundles the bearded Archangel mesh, PBR textures, and all 18 combat/locomotion animations under 4.2 MB', () => {
    const glbPath = resolve(ROOT, 'public/models/archangel-gow.glb');
    const stat = statSync(glbPath);
    expect(stat.size).toBeGreaterThan(1_500_000);
    expect(stat.size).toBeLessThan(4_200_000);

    const buf = readFileSync(glbPath);
    expect(buf.toString('utf8', 0, 4)).toBe('glTF');
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

    const nodeNames = new Set(gltf.nodes.map((n: { name?: string }) => n.name));
    for (const bone of ['root', 'pelvis', 'spine_03', 'hand_r', 'lowerarm_l', 'lowerarm_r', 'Head']) {
      expect(nodeNames.has(bone), `missing bone ${bone}`).toBe(true);
    }
    for (const meshNode of ['SuperHero_Male', 'Hair_Beard', 'Hair_Long', 'Eyes', 'Eyebrows']) {
      expect(nodeNames.has(meshNode), `missing mesh node ${meshNode}`).toBe(true);
    }

    const animNames = new Set(gltf.animations.map((a: { name?: string }) => a.name));
    for (const clip of GOW_CLIPS) {
      expect(animNames.has(clip), `missing animation clip ${clip}`).toBe(true);
    }
  });
});

describe('Batman: Arkham Freeflow + God of War Combat Choreography', () => {
  beforeEach(() => {
    resetGowState();
    runtime.position.x = 0;
    runtime.position.y = 21.06;
    runtime.position.z = 58;
    runtime.yaw = 0;
  });

  it('chains the 4-step distinct combo (light1 -> light2 -> light3 -> light4), increments actionSeq, spawns hit sparks, and applies knockback', () => {
    const target = gowRuntime.enemies[0];
    target.x = 0;
    target.z = 55.6;
    const initialHp = target.hp;

    expect(triggerLightAttack(true)).toBe(true);
    expect(gowRuntime.action).toBe('light1');
    expect(gowRuntime.actionSeq).toBe(1);
    expect(gowRuntime.lastMoveLabel).toBe('DAWN CLEAVE');
    expect(gowRuntime.slashTimer).toBeGreaterThan(0);

    // Step past hitTime (0.14s) to resolve damage + sparks + knockback
    for (let i = 0; i < 4; i++) stepGowFrame(0.05, true);
    expect(target.hp).toBeLessThan(initialHp);
    expect(target.stun).toBeGreaterThan(0);
    expect(gowRuntime.comboHits).toBeGreaterThanOrEqual(1);
    expect(gowRuntime.sparks.some((s) => s.active)).toBe(true);
    expect(Math.hypot(target.vx, target.vz)).toBeGreaterThan(0);

    // Queue step 2 (AEGIS BACKHAND)
    expect(triggerLightAttack(true)).toBe(true);
    expect(gowRuntime.queuedLight).toBe(true);
    for (let i = 0; i < 5; i++) stepGowFrame(0.05, true);
    expect(gowRuntime.action).toBe('light2');
    expect(gowRuntime.actionSeq).toBe(2);
    expect(gowRuntime.lastMoveLabel).toBe('AEGIS BACKHAND');

    // Queue step 3 (WHIRLWIND SLASH)
    expect(triggerLightAttack(true)).toBe(true);
    for (let i = 0; i < 9; i++) stepGowFrame(0.05, true);
    expect(gowRuntime.action).toBe('light3');
    expect(gowRuntime.actionSeq).toBe(3);
    expect(gowRuntime.lastMoveLabel).toBe('WHIRLWIND SLASH');

    // Queue step 4 (HEAVENS WRATH)
    expect(triggerLightAttack(true)).toBe(true);
    for (let i = 0; i < 11; i++) stepGowFrame(0.05, true);
    expect(gowRuntime.action).toBe('light4');
    expect(gowRuntime.actionSeq).toBe(4);
    expect(gowRuntime.lastMoveLabel).toBe('HEAVENS WRATH');
  });

  it('performs Arkham Freeflow magnetic vault toward distant enemies and clamps close-range lunge to >= 0', () => {
    const distant = gowRuntime.enemies[1];
    distant.x = 0;
    distant.z = 48.0; // 10 m away along -Z
    // Move other enemies out of range
    gowRuntime.enemies[0].x = 30;
    gowRuntime.enemies[2].x = -30;

    const locked = findFreeflowTarget(runtime.position.x, runtime.position.z, 14);
    expect(locked?.id).toBe(distant.id);

    expect(triggerLightAttack(false)).toBe(true);
    expect(gowRuntime.lockedTargetId).toBe(distant.id);
    // Vaults forward toward -Z at high speed
    expect(combatMotion.vz).toBeLessThan(-12);

    // When enemy is closer than 2.0 m (e.g. 1.2 m), lunge speed is 0 (never pulls backward)
    resetGowState();
    runtime.position.x = 0;
    runtime.position.z = 58;
    const closeEnemy = gowRuntime.enemies[0];
    closeEnemy.x = 0;
    closeEnemy.z = 56.8; // 1.2 m in front (-Z)
    expect(triggerLightAttack(true)).toBe(true);
    expect(combatMotion.vz).toBeLessThanOrEqual(0);
  });

  it('triggers Arkham Counter-Riposte against a yellow-ring attacker within 8.5 m without double-hitting', () => {
    const boss = gowRuntime.enemies.find((e) => e.isBoss)!;
    boss.x = 0;
    boss.z = 51.5; // 6.5 m away (within 8.5 m counter range)
    boss.state = 'windup_yellow';
    boss.stateTimer = 0.25;
    boss.hitDealt = false;
    const hpBefore = boss.hp;

    expect(triggerParry(true)).toBe(true);
    expect(gowRuntime.action).toBe('counter');
    expect(gowRuntime.lastMoveLabel).toBe('ARKHAM RIPOSTE');
    expect(gowRuntime.hitDone).toBe(true);
    expect(boss.state).toBe('stagger');
    expect(boss.stun).toBeGreaterThanOrEqual(55);
    const hpAfterCounter = boss.hp;
    expect(hpAfterCounter).toBeLessThan(hpBefore);

    // Stepping past 0.16s must NOT apply a duplicate strike hit
    for (let i = 0; i < 6; i++) stepGowFrame(0.05, true);
    expect(boss.hp).toBe(hpAfterCounter);
    expect(gowRuntime.hp).toBe(100);
  });

  it('triggers Evade Roll with Rapier combatMotion impulse and Celestial Realm Shift against Red-Ring attacks', () => {
    const boss = gowRuntime.enemies.find((e) => e.isBoss)!;
    boss.x = 0;
    boss.z = 55.0;
    boss.state = 'windup_red';
    boss.stateTimer = 0.03;

    expect(triggerDodgeRoll(true)).toBe(true);
    expect(gowRuntime.action).toBe('dodge');
    expect(combatMotion.timer).toBeGreaterThan(0.25);
    expect(Math.hypot(combatMotion.vx, combatMotion.vz)).toBeGreaterThan(8);

    const vel = advanceVelocity(
      { x: 0, y: 0, z: 0 },
      { forward: 0, strafe: 0, vertical: 0 },
      0,
      0,
      false,
      false,
      0.05,
    );
    expect(Math.hypot(vel.x, vel.z)).toBeGreaterThan(8);

    stepGowFrame(0.05, true);
    expect(gowRuntime.hp).toBe(100);
    expect(gowRuntime.realmShiftTimer).toBeGreaterThan(1.0);
  });

  it('executes a staggered Watcher when stun reaches 100 and fires Uriel Flame + Winged Rage', () => {
    const vanguard = gowRuntime.enemies[0];
    vanguard.x = 0;
    vanguard.z = 55.5;
    vanguard.state = 'stunned';
    vanguard.stun = 100;
    vanguard.stateTimer = 0;
    vanguard.stateDuration = 3.0;

    stepGowFrame(0.02, true);
    expect(gowRuntime.executableId).toBe(vanguard.id);

    expect(triggerStunExecute(true)).toBe(true);
    expect(gowRuntime.action).toBe('execute');
    for (let i = 0; i < 8; i++) stepGowFrame(0.05, true);
    expect(vanguard.state).toBe('dead');

    gowRuntime.action = 'idle';
    expect(triggerRunicSpell(true)).toBe(true);
    for (let i = 0; i < 5; i++) stepGowFrame(0.05, true);
    expect(
      gowRuntime.projectiles.some((p) => p.active && p.fromPlayer) ||
        gowRuntime.enemies.some((e) => e.id !== vanguard.id && e.hp < e.maxHp),
    ).toBe(true);

    gowRuntime.action = 'idle';
    gowRuntime.rage = 100;
    expect(triggerWingedRage(true)).toBe(true);
    expect(gowRuntime.action).toBe('rage_slam');
    expect(gowRuntime.rageActive).toBeGreaterThan(5);

    gowRuntime.action = 'idle';
    expect(triggerHeavyBash(true)).toBe(true);
    expect(gowRuntime.action).toBe('heavy');
  });
});

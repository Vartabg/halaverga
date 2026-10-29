import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cycleTarget,
  executeTurnCommand,
  findFreeflowTarget,
  resetGowState,
  selectTarget,
  triggerAerialSwoop,
  triggerDodgeRoll,
  triggerHeavyBash,
  triggerLightAttack,
  triggerParry,
  triggerRunicSpell,
  triggerSkySwordBeam,
  triggerStunExecute,
  triggerWingedRage,
} from '@/game/gowCombat';
import { stepGowFrame } from '@/game/gowEnemies';
import { ATTACK_SPECS, GOW_CLIPS, gowRuntime } from '@/game/gowTypes';
import { advanceVelocity, combatMotion, stepIsoShooterVelocity } from '@/game/motion';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

const ROOT = resolve(__dirname, '..');

describe('God of War 65-bone Archangel GLB asset pipeline & clipStart windowing', () => {
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

    // Verify Sword_Attack specs start inside the active slash window (>= 0.42s)
    expect(ATTACK_SPECS.light1.clipStart).toBeGreaterThanOrEqual(0.42);
    expect(ATTACK_SPECS.swoop.clipStart).toBeGreaterThanOrEqual(0.42);
    expect(ATTACK_SPECS.sky_beam.clipStart).toBeGreaterThanOrEqual(0.42);

    // Verify Stage 1 2.5D Illustrated Fighter Sprites, Portraits, and Painted Sanctuary Floor exist
    for (const sprite of ['uriel-ground.png', 'uriel-aerial.png', 'semjaza.png', 'vanguard.png', 'sanctuary-floor.jpg', 'uriel-portrait.jpg', 'semjaza-portrait.jpg', 'vanguard-portrait.jpg']) {
      const sStat = statSync(resolve(ROOT, 'public/sprites', sprite));
      expect(sStat.size).toBeGreaterThan(2_000);
    }
  });

  it('steps screen-space isometric velocity, settles Wing Hover at y = 24.8 m, and locks onto cursor coordinates', () => {
    resetGowState();
    runtime.yaw = 1.9; // Non-zero yaw from previous attack
    const vGround = stepIsoShooterVelocity(
      { x: 0, y: 0, z: 0 },
      { forward: 1, strafe: 0, vertical: 0 },
      { x: 0, y: 21.06, z: 58 },
      false,
      false,
      1 / 60,
    );
    expect(vGround.z).toBeLessThan(0); // W always moves North (-Z) regardless of runtime.yaw
    expect(Math.abs(vGround.x)).toBeLessThan(1e-5);

    // Simulate Wing Hover rise to 24.8 m
    let pos = { x: 0, y: 21.06, z: 58 };
    let vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 36; i++) {
      vel = stepIsoShooterVelocity(vel, { forward: 0, strafe: 0, vertical: 0 }, pos, true, false, 1 / 60);
      pos.y += vel.y * (1 / 60);
    }
    expect(Math.abs(pos.y - 24.8)).toBeLessThan(0.05);
    expect(vel.y).toBe(0);

    // Verify cursor-projected target lock-on
    const eastGuard = gowRuntime.enemies[1];
    eastGuard.x = 6.5;
    eastGuard.z = 54.0;
    gowRuntime.cursorWorldX = 6.4;
    gowRuntime.cursorWorldZ = 54.1;
    gowRuntime.cursorActiveTimer = 2.0;
    const locked = findFreeflowTarget(0, 58, 14);
    expect(locked?.id).toBe(eastGuard.id);
  });
});

describe('Batman: Arkham Freeflow + God of War Combat & Elevated Aerial Swoop / Sword Beam', () => {
  beforeEach(() => {
    resetGowState();
    useGame.setState({ flying: false, landing: false });
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

    for (let i = 0; i < 4; i++) stepGowFrame(0.05, true);
    expect(target.hp).toBeLessThan(initialHp);
    expect(target.stun).toBeGreaterThan(0);
    expect(gowRuntime.comboHits).toBeGreaterThanOrEqual(1);
    expect(gowRuntime.sparks.some((s) => s.active)).toBe(true);
    expect(Math.hypot(target.vx, target.vz)).toBeGreaterThan(0);

    expect(triggerLightAttack(true)).toBe(true);
    expect(gowRuntime.queuedLight).toBe(true);
    for (let i = 0; i < 6; i++) stepGowFrame(0.05, true);
    expect(gowRuntime.action).toBe('light2');
    expect(gowRuntime.actionSeq).toBe(2);
    expect(gowRuntime.lastMoveLabel).toBe('AEGIS BACKHAND');

    expect(triggerLightAttack(true)).toBe(true);
    for (let i = 0; i < 9; i++) stepGowFrame(0.05, true);
    expect(gowRuntime.action).toBe('light3');
    expect(gowRuntime.actionSeq).toBe(3);
    expect(gowRuntime.lastMoveLabel).toBe('WHIRLWIND SLASH');

    expect(triggerLightAttack(true)).toBe(true);
    for (let i = 0; i < 10; i++) stepGowFrame(0.05, true);
    expect(gowRuntime.action).toBe('light4');
    expect(gowRuntime.actionSeq).toBe(4);
    expect(gowRuntime.lastMoveLabel).toBe('HEAVENS WRATH');
  });

  it('locks onto distant enemies while elevated (up to 28 m), swoops in from the sky to strike and land, or shoots downward sword beams', () => {
    useGame.setState({ flying: true });
    runtime.position.x = 0;
    runtime.position.y = 32.0; // Elevated 12 m above the summit
    runtime.position.z = 66.0;
    const boss = gowRuntime.enemies.find((e) => e.isBoss)!;
    boss.x = 0;
    boss.y = 20;
    boss.z = 48.0; // 18 m away horizontally (beyond 13.5 m ground lock, within 28 m aerial lock)
    gowRuntime.enemies[0].x = 40;
    gowRuntime.enemies[1].x = -40;

    stepGowFrame(0.02, true);
    expect(gowRuntime.lockedTargetId).toBe(boss.id);
    expect(gowRuntime.threatPrompt).toContain('AERIAL LOCK');

    // 1. Shoot Celestial Sword Beam downward from elevated position
    expect(triggerSkySwordBeam(true)).toBe(true);
    expect(gowRuntime.action).toBe('sky_beam');
    for (let i = 0; i < 4; i++) stepGowFrame(0.05, true);
    const beam = gowRuntime.projectiles.find((p) => p.active && p.fromPlayer);
    expect(beam).toBeDefined();
    expect(beam!.vy).toBeLessThan(-5); // Aimed downward from the sky toward the ground target

    // 2. Swoop in from elevated position to strike and land
    gowRuntime.action = 'idle';
    const bossHpBefore = boss.hp;
    expect(triggerAerialSwoop(false)).toBe(true);
    expect(gowRuntime.action).toBe('swoop');
    expect(combatMotion.vy).toBeLessThan(-15);
    expect(combatMotion.vz).toBeLessThan(-20);

    // Advance velocity in flight to verify 3D combatMotion applies while flying
    const diveVel = advanceVelocity(
      { x: 0, y: 0, z: 0 },
      { forward: 0, strafe: 0, vertical: 0 },
      0,
      0,
      true,
      false,
      0.05,
    );
    expect(diveVel.y).toBeLessThan(-15);
    expect(diveVel.z).toBeLessThan(-20);

    // Simulate reaching the target as swoop hitTime (0.34s) resolves
    runtime.position.x = 0;
    runtime.position.y = 21.06;
    runtime.position.z = 49.8;
    for (let i = 0; i < 8; i++) stepGowFrame(0.05, true);
    expect(useGame.getState().flying).toBe(false);
    expect(boss.hp).toBeLessThan(bossHpBefore);
    expect(gowRuntime.shockwaveTimer).toBeGreaterThan(0);
  });

  it('performs Arkham Freeflow magnetic vault toward distant enemies and clamps close-range lunge to >= 0', () => {
    const distant = gowRuntime.enemies[1];
    distant.x = 0;
    distant.z = 48.0;
    gowRuntime.enemies[0].x = 30;
    gowRuntime.enemies[2].x = -30;

    const locked = findFreeflowTarget(runtime.position.x, runtime.position.z, 14);
    expect(locked?.id).toBe(distant.id);

    expect(triggerLightAttack(false)).toBe(true);
    expect(gowRuntime.lockedTargetId).toBe(distant.id);
    expect(combatMotion.vz).toBeLessThan(-12);

    resetGowState();
    runtime.position.x = 0;
    runtime.position.z = 58;
    const closeEnemy = gowRuntime.enemies[0];
    closeEnemy.x = 0;
    closeEnemy.z = 56.8;
    expect(triggerLightAttack(true)).toBe(true);
    expect(combatMotion.vz).toBeLessThanOrEqual(0);
  });

  it('separates overlapping Watchers and triggers Arkham Counter-Riposte without double-hitting', () => {
    const a = gowRuntime.enemies[0];
    const b = gowRuntime.enemies[1];
    a.x = 0; a.z = 54;
    b.x = 0.2; b.z = 54;
    stepGowFrame(0.05, true);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(1.5);

    const boss = gowRuntime.enemies.find((e) => e.isBoss)!;
    boss.x = 0;
    boss.z = 51.5;
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

  it('executes Turn-Based Cinematic Stance & Telegraph Duel: 2 AP spending, Take Wing Ground Quake evasion, and Counter Ward riposte', () => {
    resetGowState();
    expect(gowRuntime.turnPhase).toBe('PLAYER_TURN');
    expect(gowRuntime.ap).toBe(2);

    // 1. Select Semjaza explicitly and spend 1 AP on Dawn Cleave
    selectTarget('semjaza-boss');
    expect(gowRuntime.lockedTargetId).toBe('semjaza-boss');
    const boss = gowRuntime.enemies.find((e) => e.id === 'semjaza-boss')!;
    const bossHpBefore = boss.hp;

    expect(executeTurnCommand('slash', true)).toBe(true);
    expect(gowRuntime.ap).toBe(1);
    expect(gowRuntime.turnPhase).toBe('PLAYER_ANIMATING');

    for (let i = 0; i < 12; i++) stepGowFrame(0.05, true);
    expect(boss.hp).toBeLessThan(bossHpBefore);
    expect(gowRuntime.turnPhase).toBe('PLAYER_TURN'); // Still 1 AP left

    // 2. Spend 2nd AP on Take Wing (Elevate to Sky Stance) to evade Ground Quakes
    cycleTarget(1);
    expect(executeTurnCommand('wing', true)).toBe(true);
    expect(gowRuntime.ap).toBe(0);
    expect(useGame.getState().flying).toBe(true);

    // Force all enemies to have altar_quake intent so Sky Stance evades all of them
    for (const e of gowRuntime.enemies) {
      e.intent = 'altar_quake';
      e.intentDamage = 25;
    }
    const hpBeforeEnemyTurn = gowRuntime.hp;
    const rageBeforeEnemyTurn = gowRuntime.rage;

    // Advance through PLAYER_ANIMATING -> ENEMY_TURN -> Round 2 PLAYER_TURN
    for (let i = 0; i < 55; i++) stepGowFrame(0.05, true);
    expect(gowRuntime.turnPhase).toBe('PLAYER_TURN');
    expect(gowRuntime.turnNumber).toBe(2);
    expect(gowRuntime.ap).toBe(2);
    expect(gowRuntime.hp).toBe(hpBeforeEnemyTurn); // 0 damage taken from Ground Quakes while On Wing!
    expect(gowRuntime.rage).toBeGreaterThan(rageBeforeEnemyTurn);

    // 3. In Round 2 (Sky Stance), spend 1 AP on Celestial Sword Beam (stays airborne) and 1 AP on Swoop Strike (lands)
    selectTarget('nephilim-west');
    expect(executeTurnCommand('beam', true)).toBe(true);
    expect(useGame.getState().flying).toBe(true);
    for (let i = 0; i < 10; i++) stepGowFrame(0.05, true);
    expect(gowRuntime.turnPhase).toBe('PLAYER_TURN');
    expect(gowRuntime.ap).toBe(1);

    // Arm Counter Ward after descending and verify automatic riposte on ENEMY_TURN
    expect(executeTurnCommand('wing', true)).toBe(true); // 0 AP Feather Descent
    expect(useGame.getState().flying).toBe(false);
    const westGuard = gowRuntime.enemies[0];
    westGuard.intent = 'melee_cleave';
    const westHpBefore = westGuard.hp;
    expect(executeTurnCommand('ward', true)).toBe(true); // Uses 2nd AP and triggers ENEMY_TURN
    for (let i = 0; i < 55; i++) stepGowFrame(0.05, true);
    expect(westGuard.hp).toBeLessThan(westHpBefore); // Auto-riposted during ENEMY_TURN!
  });
});

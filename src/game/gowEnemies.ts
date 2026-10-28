import { addTrauma, kick, punchFov } from './cameraFx';
import { runtime } from './runtime';
import { heightAt } from '@/world/massifData';
import { ATTACK_SPECS, gowRuntime, type GowEnemy } from './gowTypes';
import { applyHitToEnemy, nearestLiveEnemy, pushPopup, triggerLightAttack } from './gowCombat';

function spawnProjectile(fromPlayer: boolean, x: number, y: number, z: number, vx: number, vy: number, vz: number, damage: number, stun: number) {
  const slot = gowRuntime.projectiles.find(p => !p.active) ?? gowRuntime.projectiles[0];
  Object.assign(slot, { active: true, fromPlayer, x, y, z, vx, vy, vz, life: 2.4, damage, stun });
}

function resolvePlayerStrike(reduced: boolean) {
  const act = gowRuntime.action;
  if (act === 'idle' || act === 'parry' || act === 'dodge' || act === 'hurt') return;
  const spec = ATTACK_SPECS[act];
  if (gowRuntime.hitDone || gowRuntime.actionTimer < spec.hitTime) return;
  gowRuntime.hitDone = true;

  const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z;
  if (act === 'runic') {
    const t = nearestLiveEnemy(px, pz, 24);
    let dx = -Math.sin(runtime.yaw), dy = 0, dz = -Math.cos(runtime.yaw);
    if (t) {
      dx = t.x - px; dy = (t.y + 1.0 * t.scale) - py; dz = t.z - pz;
      const len = Math.max(0.01, Math.hypot(dx, dy, dz));
      dx /= len; dy /= len; dz /= len;
    }
    spawnProjectile(true, px + dx * 0.8, py + 0.3, pz + dz * 0.8, dx * 22, dy * 22, dz * 22, spec.damage, spec.stun);
    if (!reduced) { kick(runtime.shooter.camFx, 1.1, 0); punchFov(runtime.shooter.camFx, 'shot', 1.2); }
    return;
  }

  let landed = false;
  const fx = -Math.sin(runtime.yaw), fz = -Math.cos(runtime.yaw);
  for (const e of gowRuntime.enemies) {
    if (e.state === 'dead') continue;
    const dx = e.x - px, dz = e.z - pz, dist = Math.hypot(dx, dz);
    if (dist > spec.reach + e.scale * 0.55) continue;
    const dot = dist > 0.1 ? (dx / dist) * fx + (dz / dist) * fz : 1;
    if (act !== 'rage_slam' && dot < -0.15) continue;
    applyHitToEnemy(e, spec.damage, spec.stun, reduced, act === 'execute' ? 'EXECUTION' : act === 'rage_slam' ? 'SLAM' : undefined);
    if (dist > 0.05 && e.hp > 0) {
      const push = act === 'heavy' || act === 'rage_slam' ? 1.45 : 0.55;
      e.x += (dx / dist) * push; e.z += (dz / dist) * push;
    }
    landed = true;
  }
  if (landed && !reduced) {
    gowRuntime.hitstopTimer = act === 'light3' || act === 'heavy' || act === 'execute' || act === 'rage_slam' ? 0.065 : 0.045;
    kick(runtime.shooter.camFx, act === 'heavy' ? 1.6 : 0.9, (gowRuntime.comboStep % 2 === 0 ? -1 : 1) * 0.8);
    punchFov(runtime.shooter.camFx, 'shot', act === 'rage_slam' || act === 'execute' ? 2.2 : 1.1);
    if (act === 'rage_slam' || act === 'execute') addTrauma(runtime.shooter.camFx, 0.38);
  }
}

function damagePlayer(amount: number, source: GowEnemy, unblockable: boolean, reduced: boolean) {
  if (gowRuntime.dodgeInvuln > 0) {
    pushPopup('EVADED!', 'parry', runtime.position.x, runtime.position.y + 1.1, runtime.position.z);
    return;
  }
  if (!unblockable && gowRuntime.parryWindow > 0) {
    Object.assign(source, { state: 'stagger', stateTimer: 0, stateDuration: 1.15, clip: 'Hit_Head', clipSpeed: 0.85 });
    applyHitToEnemy(source, 22, 48, reduced, 'PARRY COUNTER');
    Object.assign(gowRuntime, { shockwaveTimer: 0.42, shockwaveColor: '#ffe58f', shockwaveX: runtime.position.x, shockwaveY: runtime.position.y - 0.9, shockwaveZ: runtime.position.z, shockwaveMaxR: 5.2 });
    if (!reduced) { gowRuntime.hitstopTimer = 0.075; punchFov(runtime.shooter.camFx, 'shot', 1.8); }
    return;
  }
  gowRuntime.hp = Math.max(15, gowRuntime.hp - amount);
  gowRuntime.rage = Math.min(gowRuntime.maxRage, gowRuntime.rage + 12); gowRuntime.comboHits = 0;
  if (gowRuntime.action === 'idle') Object.assign(gowRuntime, { action: 'hurt', actionTimer: 0, actionDuration: 0.34 });
  pushPopup(`-${amount}`, 'crimson', runtime.position.x, runtime.position.y + 1.0, runtime.position.z);
  if (!reduced) addTrauma(runtime.shooter.camFx, 0.32);
}

function stepSingleEnemy(e: GowEnemy, dt: number, px: number, py: number, pz: number, reduced: boolean) {
  e.flashTimer = Math.max(0, e.flashTimer - dt);
  const groundY = Math.max(20.0, heightAt(e.x, e.z));
  e.y = Math.hypot(e.x, e.z - 55) < 18 ? 20.0 : groundY;

  if (e.state === 'dead') {
    e.stateTimer += dt; e.respawnTimer -= dt;
    if (e.respawnTimer <= 0) {
      e.hp = e.maxHp; e.stun = 0; e.x = e.spawnX; e.z = e.spawnZ;
      e.state = 'idle'; e.stateTimer = 0; e.cooldown = 1.2; e.clip = 'Sword_Idle';
    }
    return;
  }

  const dx = px - e.x, dz = pz - e.z, dist = Math.hypot(dx, dz);
  if (e.state !== 'stunned' && e.state !== 'stagger' && dist > 0.2) e.yaw = Math.atan2(dx, dz);
  if ((e.state === 'idle' || e.state === 'chase') && e.stun > 0) e.stun = Math.max(0, e.stun - dt * 2.5);

  e.stateTimer += dt;
  if (e.state === 'stunned' || e.state === 'stagger') {
    if (e.stateTimer >= e.stateDuration) {
      if (e.state === 'stunned') e.stun = 50;
      e.state = 'idle'; e.stateTimer = 0; e.cooldown = 0.8; e.clip = 'Sword_Idle'; e.clipSpeed = 1;
    }
    return;
  }

  if (e.state === 'windup_yellow' || e.state === 'windup_red' || e.state === 'windup_spell') {
    const unblockable = e.state === 'windup_red';
    if (!e.hitDealt && e.stateTimer >= e.stateDuration * 0.62) {
      e.hitDealt = true;
      if (e.state === 'windup_spell') {
        const len = Math.max(0.1, Math.hypot(dx, py - (e.y + 1.4), dz));
        spawnProjectile(false, e.x, e.y + 1.5 * e.scale, e.z, (dx / len) * 14, ((py - (e.y + 1.4)) / len) * 14, (dz / len) * 14, 16, 0);
      } else {
        const hitR = (e.isBoss ? 5.2 : 3.4) + (unblockable ? 1.4 : 0);
        if (dist <= hitR && Math.abs(py - e.y) < 3.8) damagePlayer(unblockable ? 24 : e.isBoss ? 18 : 12, e, unblockable, reduced);
        if (unblockable) {
          gowRuntime.shockwaveTimer = 0.45; gowRuntime.shockwaveColor = '#ff5436';
          gowRuntime.shockwaveX = e.x; gowRuntime.shockwaveY = e.y + 0.1; gowRuntime.shockwaveZ = e.z; gowRuntime.shockwaveMaxR = 5.6;
        }
      }
    }
    if (e.stateTimer >= e.stateDuration) {
      e.state = 'idle'; e.stateTimer = 0; e.cooldown = e.isBoss ? 1.5 : 2.1; e.clip = 'Sword_Idle'; e.clipSpeed = 1;
    }
    return;
  }

  if (dist > 28) { e.state = 'idle'; e.clip = 'Sword_Idle'; e.clipSpeed = 1; return; }
  if (dist > (e.isBoss ? 4.4 : 3.2)) {
    e.state = 'chase';
    const spd = (e.isBoss ? 3.5 : 4.0) * dt;
    e.x += (dx / dist) * spd; e.z += (dz / dist) * spd;
    e.clip = dist > 8 ? 'Sprint_Loop' : 'Walk_Loop'; e.clipSpeed = 1.1;
  } else {
    e.state = 'idle'; e.clip = 'Sword_Idle'; e.clipSpeed = 1;
  }

  e.cooldown -= dt;
  if (e.cooldown <= 0 && dist <= (e.isBoss ? 11.5 : 3.9)) {
    e.stateTimer = 0; e.hitDealt = false; e.attackIndex++;
    if (e.isBoss && dist > 5.5) { e.state = 'windup_spell'; e.stateDuration = 0.85; e.clip = 'Spell_Simple_Shoot'; e.clipSpeed = 1.1; }
    else if (e.isBoss && e.attackIndex % 3 === 0) { e.state = 'windup_red'; e.stateDuration = 0.95; e.clip = 'Punch_Cross'; e.clipSpeed = 0.9; }
    else { e.state = 'windup_yellow'; e.stateDuration = 0.82; e.clip = 'Sword_Attack'; e.clipSpeed = 1.05; }
  }
}

export function stepGowFrame(rawDt: number, reduced: boolean) {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (gowRuntime.hitstopTimer > 0) { gowRuntime.hitstopTimer = Math.max(0, gowRuntime.hitstopTimer - dt); return; }
  gowRuntime.parryWindow = Math.max(0, gowRuntime.parryWindow - dt);
  gowRuntime.dodgeInvuln = Math.max(0, gowRuntime.dodgeInvuln - dt);
  gowRuntime.runicCooldown = Math.max(0, gowRuntime.runicCooldown - dt);
  gowRuntime.rageActive = Math.max(0, gowRuntime.rageActive - dt);
  gowRuntime.comboResetTimer = Math.max(0, gowRuntime.comboResetTimer - dt);
  gowRuntime.comboBannerTimer = Math.max(0, gowRuntime.comboBannerTimer - dt);
  if (gowRuntime.comboBannerTimer <= 0) gowRuntime.comboHits = 0;
  gowRuntime.realmShiftTimer = Math.max(0, gowRuntime.realmShiftTimer - dt);
  gowRuntime.shockwaveTimer = Math.max(0, gowRuntime.shockwaveTimer - dt);
  if (gowRuntime.action !== 'idle') {
    gowRuntime.actionTimer += dt; resolvePlayerStrike(reduced);
    if (gowRuntime.actionTimer >= gowRuntime.actionDuration) {
      const nextQueued = gowRuntime.queuedLight;
      gowRuntime.action = 'idle'; gowRuntime.actionTimer = 0;
      if (nextQueued) triggerLightAttack(reduced);
    }
  }

  const enemyDt = gowRuntime.realmShiftTimer > 0 ? dt * 0.35 : dt;
  const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z;
  let execId = null as typeof gowRuntime.executableId;
  let prompt: typeof gowRuntime.threatPrompt = '';

  for (const e of gowRuntime.enemies) {
    stepSingleEnemy(e, enemyDt, px, py, pz, reduced);
    const d = Math.hypot(e.x - px, e.z - pz);
    if ((e.state === 'stunned' || (e.state === 'stagger' && e.stun >= e.maxStun)) && d <= 5.5) { execId = e.id; prompt = 'EXECUTE [E]'; }
    else if (!prompt && e.state === 'windup_red' && d <= 7.5) prompt = 'EVADE [SHIFT / C]';
    else if (!prompt && e.state === 'windup_yellow' && d <= 6.0) prompt = 'PARRY [Q / RIGHT-CLICK]';
  }
  gowRuntime.executableId = execId; gowRuntime.threatPrompt = prompt;

  for (const p of gowRuntime.projectiles) {
    if (!p.active) continue;
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.life <= 0) { p.active = false; continue; }
    if (p.fromPlayer) {
      for (const e of gowRuntime.enemies) {
        if (e.state !== 'dead' && Math.hypot(e.x - p.x, e.z - p.z) <= 1.8 * e.scale) {
          applyHitToEnemy(e, p.damage, p.stun, reduced, 'URIEL FLAME'); p.active = false;
          gowRuntime.shockwaveTimer = 0.38; gowRuntime.shockwaveX = e.x; gowRuntime.shockwaveZ = e.z;
          break;
        }
      }
    } else if (Math.hypot(px - p.x, pz - p.z) <= 1.35) {
      damagePlayer(p.damage, gowRuntime.enemies[2], false, reduced); p.active = false;
    }
  }
}

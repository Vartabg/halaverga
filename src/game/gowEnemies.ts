import { addTrauma, kick, punchFov } from './cameraFx';
import { runtime } from './runtime';
import { heightAt } from '@/world/massifData';
import { ATTACK_SPECS, gowRuntime, type GowEnemy } from './gowTypes';
import { applyHitToEnemy, findFreeflowTarget, nearestLiveEnemy, pushPopup, triggerLightAttack } from './gowCombat';

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
  const isOmni = act === 'rage_slam' || act === 'light3';
  for (const e of gowRuntime.enemies) {
    if (e.state === 'dead') continue;
    const dx = e.x - px, dz = e.z - pz, dist = Math.hypot(dx, dz);
    if (dist > spec.reach + e.scale * 0.55) continue;
    const dot = dist > 0.1 ? (dx / dist) * fx + (dz / dist) * fz : 1;
    if (!isOmni && e.id !== gowRuntime.lockedTargetId && dot < -0.15) continue;
    const tag = act === 'execute' ? 'EXECUTION' : act === 'rage_slam' ? 'SLAM' : act === 'light4' ? 'WRATH' : act === 'heavy' ? 'CLEAVE' : undefined;
    applyHitToEnemy(e, spec.damage, spec.stun, reduced, tag);
    landed = true;
  }
  const heavyHit = act === 'light3' || act === 'light4' || act === 'heavy' || act === 'execute' || act === 'rage_slam' || act === 'counter';
  if (landed && !reduced) {
    gowRuntime.hitstopTimer = heavyHit ? 0.065 : 0.045;
    kick(runtime.shooter.camFx, heavyHit ? 1.55 : 0.9, (gowRuntime.comboStep % 2 === 0 ? -1 : 1) * 0.85);
    punchFov(runtime.shooter.camFx, 'shot', act === 'rage_slam' || act === 'execute' || act === 'light4' ? 2.2 : 1.15);
    if (act === 'rage_slam' || act === 'execute' || act === 'light4') addTrauma(runtime.shooter.camFx, 0.38);
  }
}

function damagePlayer(amount: number, source: GowEnemy, unblockable: boolean, reduced: boolean) {
  if (gowRuntime.dodgeInvuln > 0) {
    pushPopup('EVADED!', 'parry', runtime.position.x, runtime.position.y + 1.1, runtime.position.z);
    return;
  }
  if (!unblockable && gowRuntime.parryWindow > 0) {
    Object.assign(source, { state: 'stagger', stateTimer: 0, stateDuration: 1.15, clip: 'Hit_Head', clipSpeed: 0.85 });
    applyHitToEnemy(source, 26, 50, reduced, 'PARRY COUNTER');
    Object.assign(gowRuntime, { shockwaveTimer: 0.42, shockwaveColor: '#5ee6d0', shockwaveX: runtime.position.x, shockwaveY: runtime.position.y - 0.9, shockwaveZ: runtime.position.z, shockwaveMaxR: 5.2 });
    if (!reduced) { gowRuntime.hitstopTimer = 0.075; punchFov(runtime.shooter.camFx, 'shot', 1.8); }
    return;
  }
  gowRuntime.hp = Math.max(15, gowRuntime.hp - amount);
  gowRuntime.rage = Math.min(gowRuntime.maxRage, gowRuntime.rage + 12); gowRuntime.comboHits = 0;
  if (gowRuntime.action === 'idle') Object.assign(gowRuntime, { action: 'hurt', actionSeq: gowRuntime.actionSeq + 1, actionTimer: 0, actionDuration: 0.34 });
  pushPopup(`-${amount}`, 'crimson', runtime.position.x, runtime.position.y + 1.0, runtime.position.z);
  if (!reduced) addTrauma(runtime.shooter.camFx, 0.32);
}

function stepSingleEnemy(e: GowEnemy, dt: number, px: number, py: number, pz: number, reduced: boolean) {
  e.flashTimer = Math.max(0, e.flashTimer - dt);
  if (Math.hypot(e.vx, e.vz) > 0.05) { const damp = Math.exp(-10 * dt); e.x += e.vx * dt; e.z += e.vz * dt; e.vx *= damp; e.vz *= damp; }
  const radFromCenter = Math.hypot(e.x, e.z - 55);
  if (radFromCenter > 19.2) { e.x *= 19.2 / radFromCenter; e.z = 55 + (e.z - 55) * (19.2 / radFromCenter); }
  e.y = radFromCenter < 18 ? 20.0 : Math.max(20.0, heightAt(e.x, e.z));
  if (e.state === 'dead') {
    e.stateTimer += dt; e.respawnTimer -= dt;
    if (e.respawnTimer <= 0) Object.assign(e, { hp: e.maxHp, stun: 0, x: e.spawnX, z: e.spawnZ, vx: 0, vz: 0, state: 'idle', stateTimer: 0, cooldown: 1.2, clip: 'Sword_Idle' });
    return;
  }
  let dx = px - e.x, dz = pz - e.z, dist = Math.hypot(dx, dz);
  if (dist < 1.85 && dist > 0.001) {
    const pushOut = 1.85 - dist; e.x -= (dx / dist) * pushOut; e.z -= (dz / dist) * pushOut;
    dx = px - e.x; dz = pz - e.z; dist = Math.hypot(dx, dz);
  }
  if (e.state !== 'stunned' && e.state !== 'stagger' && dist > 0.2) e.yaw = Math.atan2(dx, dz);
  if ((e.state === 'idle' || e.state === 'chase') && e.stun > 0) e.stun = Math.max(0, e.stun - dt * 2.5);

  e.stateTimer += dt;
  if (e.state === 'stunned' || e.state === 'stagger') {
    if (e.stateTimer >= e.stateDuration) {
      if (e.state === 'stunned') e.stun = 50;
      Object.assign(e, { state: 'idle', stateTimer: 0, cooldown: 0.8, clip: 'Sword_Idle', clipSpeed: 1 });
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
        if (unblockable) Object.assign(gowRuntime, { shockwaveTimer: 0.45, shockwaveColor: '#ff5436', shockwaveX: e.x, shockwaveY: e.y + 0.1, shockwaveZ: e.z, shockwaveMaxR: 5.6 });
      }
    }
    if (e.stateTimer >= e.stateDuration) Object.assign(e, { state: 'idle', stateTimer: 0, cooldown: e.isBoss ? 1.5 : 2.1, clip: 'Sword_Idle', clipSpeed: 1 });
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
    if (e.isBoss && dist > 5.5) Object.assign(e, { state: 'windup_spell', stateDuration: 0.85, clip: 'Spell_Simple_Shoot', clipSpeed: 1.1 });
    else if (e.isBoss && e.attackIndex % 3 === 0) Object.assign(e, { state: 'windup_red', stateDuration: 0.95, clip: 'Punch_Cross', clipSpeed: 0.9 });
    else Object.assign(e, { state: 'windup_yellow', stateDuration: 0.82, clip: 'Sword_Attack', clipSpeed: 1.05 });
  }
}

export function stepGowFrame(rawDt: number, reduced: boolean) {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (gowRuntime.hitstopTimer > 0) { gowRuntime.hitstopTimer = Math.max(0, gowRuntime.hitstopTimer - dt); return; }
  gowRuntime.parryWindow = Math.max(0, gowRuntime.parryWindow - dt); gowRuntime.dodgeInvuln = Math.max(0, gowRuntime.dodgeInvuln - dt);
  gowRuntime.runicCooldown = Math.max(0, gowRuntime.runicCooldown - dt); gowRuntime.rageActive = Math.max(0, gowRuntime.rageActive - dt);
  gowRuntime.comboResetTimer = Math.max(0, gowRuntime.comboResetTimer - dt); gowRuntime.comboBannerTimer = Math.max(0, gowRuntime.comboBannerTimer - dt);
  if (gowRuntime.comboBannerTimer <= 0) gowRuntime.comboHits = 0;
  gowRuntime.realmShiftTimer = Math.max(0, gowRuntime.realmShiftTimer - dt); gowRuntime.shockwaveTimer = Math.max(0, gowRuntime.shockwaveTimer - dt);
  gowRuntime.slashTimer = Math.max(0, gowRuntime.slashTimer - dt);
  if (gowRuntime.action !== 'idle') {
    gowRuntime.actionTimer += dt; resolvePlayerStrike(reduced);
    if (gowRuntime.actionTimer >= gowRuntime.actionDuration) {
      const nextQueued = gowRuntime.queuedLight; gowRuntime.action = 'idle'; gowRuntime.actionTimer = 0;
      if (nextQueued) triggerLightAttack(reduced);
    }
  }

  const enemyDt = gowRuntime.realmShiftTimer > 0 ? dt * 0.35 : dt;
  const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z;
  if (gowRuntime.action === 'idle') findFreeflowTarget(px, pz, 13.5);
  let execId = null as typeof gowRuntime.executableId, prompt = '';

  for (const e of gowRuntime.enemies) {
    stepSingleEnemy(e, enemyDt, px, py, pz, reduced);
    const d = Math.hypot(e.x - px, e.z - pz);
    if ((e.state === 'stunned' || (e.state === 'stagger' && e.stun >= e.maxStun)) && d <= 6.2) { execId = e.id; prompt = 'EXECUTE [E]'; }
    else if (!prompt && e.state === 'windup_red' && d <= 8.0) prompt = 'EVADE [SHIFT / C]';
    else if (!prompt && e.state === 'windup_yellow' && d <= 8.5) prompt = '⚡ ARKHAM COUNTER [Q / RIGHT-CLICK]';
  }
  gowRuntime.executableId = execId; gowRuntime.threatPrompt = prompt;

  for (const s of gowRuntime.sparks) {
    if (!s.active) continue;
    s.life -= dt; if (s.life <= 0) { s.active = false; continue; }
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vy -= 9.8 * dt;
  }

  for (const p of gowRuntime.projectiles) {
    if (!p.active) continue;
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.life <= 0) { p.active = false; continue; }
    if (p.fromPlayer) {
      for (const e of gowRuntime.enemies) {
        if (e.state !== 'dead' && Math.hypot(e.x - p.x, e.z - p.z) <= 1.8 * e.scale) {
          applyHitToEnemy(e, p.damage, p.stun, reduced, 'URIEL FLAME'); p.active = false;
          Object.assign(gowRuntime, { shockwaveTimer: 0.38, shockwaveColor: '#ffae42', shockwaveX: e.x, shockwaveZ: e.z });
          break;
        }
      }
    } else if (Math.hypot(px - p.x, pz - p.z) <= 1.35) {
      damagePlayer(p.damage, gowRuntime.enemies[2], false, reduced); p.active = false;
    }
  }
}

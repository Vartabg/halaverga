import { addTrauma, kick, punchFov } from './cameraFx';
import { combatMotion } from './motion';
import { runtime } from './runtime';
import { useGame } from './store';
import { heightAt } from '@/world/massifData';
import { ATTACK_SPECS, gowRuntime, rollNextEnemyIntents, type GowEnemy } from './gowTypes';
import { applyHitToEnemy, findFreeflowTarget, nearestLiveEnemy, pushPopup, spawnHitSparks, startEnemyTurn, triggerLightAttack } from './gowCombat';
import { stepPrototypeLab, triggerCutIn } from './gowPrototypeLab';

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
  if (act === 'runic' || act === 'sky_beam') {
    const t = gowRuntime.enemies.find(e => e.id === gowRuntime.lockedTargetId && e.state !== 'dead') ?? nearestLiveEnemy(px, pz, 28);
    let dx = t ? t.x - px : -Math.sin(runtime.yaw), dy = t ? (t.y + 1.05 * t.scale) - py : (act === 'sky_beam' ? -0.35 : 0), dz = t ? t.z - pz : -Math.cos(runtime.yaw);
    const len = Math.max(0.01, Math.hypot(dx, dy, dz)), spd = act === 'sky_beam' ? 28 : 22;
    dx /= len; dy /= len; dz /= len;
    spawnProjectile(true, px + dx * 0.8, py + 0.25, pz + dz * 0.8, dx * spd, dy * spd, dz * spd, spec.damage, spec.stun);
    if (!reduced) { kick(runtime.shooter.camFx, 1.0, 0); punchFov(runtime.shooter.camFx, 'shot', 1.2); }
    return;
  }
  if (act === 'swoop') {
    combatMotion.vy = 0; if (useGame.getState().flying) useGame.setState({ flying: false, landing: false });
    Object.assign(gowRuntime, { shockwaveTimer: 0.48, shockwaveColor: '#ffd166', shockwaveX: px, shockwaveY: 20.12, shockwaveZ: pz, shockwaveMaxR: 6.2 });
  }
  let landed = false;
  const fx = -Math.sin(runtime.yaw), fz = -Math.cos(runtime.yaw), isOmni = act === 'rage_slam' || act === 'light3' || act === 'swoop';
  for (const e of gowRuntime.enemies) {
    if (e.state === 'dead') continue;
    const dx = e.x - px, dz = e.z - pz, dist = Math.hypot(dx, dz), isLocked = e.id === gowRuntime.lockedTargetId;
    if (!isLocked && act !== 'rage_slam') {
      if (dist > spec.reach + e.scale * 0.55 || (!isOmni && (dist > 0.1 ? (dx / dist) * fx + (dz / dist) * fz : 1) < -0.15)) continue;
    }
    const tag = act === 'execute' ? 'EXECUTION' : act === 'swoop' ? 'AERIAL SWOOP' : act === 'rage_slam' ? 'DAWN JUDGEMENT' : act === 'light4' ? 'WRATH' : act === 'heavy' ? 'VECTOR RAM' : undefined;
    applyHitToEnemy(e, spec.damage, spec.stun, reduced, tag); landed = true;
  }
  if (gowRuntime.returnAfterStrike && !gowRuntime.queuedLight) {
    gowRuntime.returnAfterStrike = false;
    const rx = gowRuntime.homeX - px, rz = gowRuntime.homeZ - pz;
    if (Math.hypot(rx, rz) > 0.4) Object.assign(combatMotion, { vx: rx / 0.22, vy: 0, vz: rz / 0.22, timer: 0.22 });
  }
  const heavyHit = act === 'light3' || act === 'light4' || act === 'heavy' || act === 'execute' || act === 'rage_slam' || act === 'counter' || act === 'swoop';
  if (landed && !reduced) {
    gowRuntime.hitstopTimer = heavyHit ? 0.065 : 0.045;
    kick(runtime.shooter.camFx, heavyHit ? 1.55 : 0.9, (gowRuntime.comboStep % 2 === 0 ? -1 : 1) * 0.85);
    punchFov(runtime.shooter.camFx, 'shot', act === 'rage_slam' || act === 'execute' || act === 'light4' || act === 'swoop' ? 2.2 : 1.15);
    if (act === 'rage_slam' || act === 'execute' || act === 'light4' || act === 'swoop') addTrauma(runtime.shooter.camFx, 0.38);
  }
}

function damagePlayer(amount: number, source: GowEnemy, unblockable: boolean, reduced: boolean) {
  if (gowRuntime.dodgeInvuln > 0) { pushPopup('EVADED!', 'parry', runtime.position.x, runtime.position.y + 1.1, runtime.position.z); return; }
  if (gowRuntime.sigilPrism) {
    gowRuntime.collisionsTriggered++; Object.assign(source, { state: 'stagger', stateTimer: 0, stateDuration: 1.25 });
    applyHitToEnemy(source, 45, 50, reduced, 'PRISM REFLECT');
    Object.assign(gowRuntime, { shockwaveTimer: 0.45, shockwaveColor: '#ffd166', shockwaveX: source.x, shockwaveY: source.y + 0.1, shockwaveZ: source.z, shockwaveMaxR: 5.8 });
    triggerCutIn('PRISM REFLECT!', `${source.name.toUpperCase()} HIT BY OWN STRIKE`, '/sprites/cutin-uriel.jpg'); return;
  }
  if (!unblockable && (gowRuntime.guardWard || gowRuntime.parryWindow > 0)) {
    gowRuntime.guardWard = false; gowRuntime.parryWindow = 0; gowRuntime.collisionsTriggered++;
    Object.assign(source, { state: 'stagger', stateTimer: 0, stateDuration: 1.15 });
    applyHitToEnemy(source, 42, 50, reduced, 'COUNTER RIPOSTE');
    Object.assign(gowRuntime, { shockwaveTimer: 0.42, shockwaveColor: '#5ee6d0', shockwaveX: source.x, shockwaveY: source.y + 0.1, shockwaveZ: source.z, shockwaveMaxR: 5.2 });
    triggerCutIn('COUNTER RIPOSTE!', `${source.name.toUpperCase()} PARRIED (-42 DMG)`, '/sprites/cutin-uriel.jpg');
    if (!reduced) { gowRuntime.hitstopTimer = 0.075; punchFov(runtime.shooter.camFx, 'shot', 1.8); }
    return;
  }
  const finalDmg = gowRuntime.guardWard ? Math.max(4, Math.round(amount * 0.5)) : amount;
  gowRuntime.guardWard = false; gowRuntime.hp = Math.max(0, gowRuntime.hp - finalDmg); gowRuntime.rage = Math.min(gowRuntime.maxRage, gowRuntime.rage + 12); gowRuntime.comboHits = 0;
  if (gowRuntime.hp <= 0) { gowRuntime.outcome = 'DEFEAT'; triggerCutIn('FALLEN AT THE SUMMIT', 'URIEL OVERWHELMED BY THE WATCHERS', '/sprites/cutin-semjaza.jpg'); }
  if (gowRuntime.action === 'idle') Object.assign(gowRuntime, { action: 'hurt', actionSeq: gowRuntime.actionSeq + 1, actionTimer: 0, actionDuration: 0.34 });
  pushPopup(`-${finalDmg}`, 'crimson', runtime.position.x, runtime.position.y + 1.0, runtime.position.z);
  if (!reduced) addTrauma(runtime.shooter.camFx, 0.32);
}

function stepSingleEnemy(e: GowEnemy, dt: number, px: number, py: number, pz: number, reduced: boolean) {
  e.flashTimer = Math.max(0, e.flashTimer - dt);
  if (Math.hypot(e.vx, e.vz) > 0.05) { const damp = Math.exp(-(gowRuntime.demoMode === 'clash' ? 2.8 : 8) * dt); e.x += e.vx * dt; e.z += e.vz * dt; e.vx *= damp; e.vz *= damp; }
  else if (e.state === 'idle') { e.x += (e.spawnX - e.x) * Math.min(1, dt * 4); e.z += (e.spawnZ - e.z) * Math.min(1, dt * 4); }
  const radFromCenter = Math.hypot(e.x, e.z - 55);
  if (radFromCenter > 19.2) { e.x *= 19.2 / radFromCenter; e.z = 55 + (e.z - 55) * (19.2 / radFromCenter); }
  e.y = radFromCenter < 18 ? 20.0 : Math.max(20.0, heightAt(e.x, e.z));
  if (e.state === 'dead') {
    if (gowRuntime.outcome !== 'ONGOING') return;
    e.stateTimer += dt; e.respawnTimer -= dt;
    if (e.respawnTimer <= 0) Object.assign(e, { hp: e.maxHp, stun: 0, x: e.spawnX, z: e.spawnZ, vx: 0, vz: 0, state: 'idle', stateTimer: 0 });
    return;
  }
  const dx = px - e.x, dz = pz - e.z, dist = Math.hypot(dx, dz);
  if (dist > 0.2) e.yaw = Math.atan2(dx, dz);
  e.stateTimer += dt;
  if (e.state === 'stunned' || e.state === 'stagger') {
    if (e.state === 'stagger' && e.stateTimer >= e.stateDuration) Object.assign(e, { state: 'idle', stateTimer: 0 });
    return;
  }
  if (e.state === 'windup_yellow' || e.state === 'windup_red' || e.state === 'windup_spell') {
    const unblockable = e.state === 'windup_red';
    if (!e.hitDealt && e.stateTimer >= e.stateDuration * 0.58) {
      e.hitDealt = true;
      if (unblockable && useGame.getState().flying) {
        gowRuntime.rage = Math.min(gowRuntime.maxRage, gowRuntime.rage + 15);
        pushPopup('EVADED ON WING! +15 RAGE', 'parry', px, py + 1.2, pz);
        Object.assign(gowRuntime, { shockwaveTimer: 0.45, shockwaveColor: '#ff5436', shockwaveX: e.x, shockwaveY: e.y + 0.1, shockwaveZ: e.z, shockwaveMaxR: 5.8 });
      } else if (e.state === 'windup_spell') {
        damagePlayer(useGame.getState().flying ? e.intentDamage : Math.round(e.intentDamage * 0.55), e, false, reduced);
      } else {
        if (unblockable) Object.assign(gowRuntime, { shockwaveTimer: 0.45, shockwaveColor: '#ff5436', shockwaveX: e.x, shockwaveY: e.y + 0.1, shockwaveZ: e.z, shockwaveMaxR: 5.6 });
        damagePlayer(e.intentDamage || (unblockable ? 24 : 16), e, unblockable, reduced);
      }
    }
    if (e.stateTimer >= e.stateDuration) Object.assign(e, { state: 'idle', stateTimer: 0 });
  }
}

function stepEnemyTurnSequence(dt: number) {
  if (gowRuntime.turnPhase !== 'ENEMY_TURN') return;
  const list = gowRuntime.enemies;
  while (gowRuntime.activeEnemyIndex < list.length) {
    const e = list[gowRuntime.activeEnemyIndex];
    if (e.state === 'dead') { gowRuntime.activeEnemyIndex++; gowRuntime.enemyTurnTimer = 0; continue; }
    if (gowRuntime.enemyTurnTimer === 0) {
      if (e.state === 'stunned') {
        pushPopup(`${e.name.toUpperCase()} STUNNED · SKIP!`, 'stun', e.x, e.y + 2.0 * e.scale, e.z);
        Object.assign(e, { state: 'idle', stun: 0, stateTimer: 0 }); gowRuntime.enemyTurnTimer = 0.01;
      } else {
        const ws = e.intent === 'altar_quake' ? 'windup_red' : e.intent === 'sky_piercer' ? 'windup_spell' : 'windup_yellow';
        Object.assign(e, { state: ws, stateTimer: 0, stateDuration: 0.64, hitDealt: false, vx: (runtime.position.x - e.x) * 0.4, vz: (runtime.position.z - e.z) * 0.4 });
        gowRuntime.enemyTurnTimer = 0.01;
      }
    }
    gowRuntime.enemyTurnTimer += dt;
    if (gowRuntime.enemyTurnTimer >= 0.68) { gowRuntime.activeEnemyIndex++; gowRuntime.enemyTurnTimer = 0; }
    return;
  }
  rollNextEnemyIntents(++gowRuntime.turnNumber, list);
  Object.assign(gowRuntime, { turnPhase: 'PLAYER_TURN', ap: gowRuntime.maxAp, activeEnemyIndex: -1, enemyTurnTimer: 0, guardWard: false, sigilPrism: false });
}

export function stepGowFrame(rawDt: number, reduced: boolean) {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (gowRuntime.hitstopTimer > 0) { gowRuntime.hitstopTimer = Math.max(0, gowRuntime.hitstopTimer - dt); return; }
  gowRuntime.parryWindow = Math.max(0, gowRuntime.parryWindow - dt); gowRuntime.dodgeInvuln = Math.max(0, gowRuntime.dodgeInvuln - dt);
  gowRuntime.runicCooldown = Math.max(0, gowRuntime.runicCooldown - dt); gowRuntime.rageActive = Math.max(0, gowRuntime.rageActive - dt);
  gowRuntime.comboResetTimer = Math.max(0, gowRuntime.comboResetTimer - dt); gowRuntime.comboBannerTimer = Math.max(0, gowRuntime.comboBannerTimer - dt);
  if (gowRuntime.comboBannerTimer <= 0) gowRuntime.comboHits = 0;
  gowRuntime.realmShiftTimer = Math.max(0, gowRuntime.realmShiftTimer - dt); gowRuntime.shockwaveTimer = Math.max(0, gowRuntime.shockwaveTimer - dt);
  gowRuntime.slashTimer = Math.max(0, gowRuntime.slashTimer - dt); gowRuntime.cursorActiveTimer = Math.max(0, gowRuntime.cursorActiveTimer - dt);
  if (gowRuntime.action === 'idle' && Math.abs(runtime.velocity.x) > 0.35) gowRuntime.facingLeft = runtime.velocity.x < 0;
  if (gowRuntime.action !== 'idle') {
    gowRuntime.actionTimer += dt; resolvePlayerStrike(reduced);
    if (gowRuntime.actionTimer >= gowRuntime.actionDuration) {
      const nextQueued = gowRuntime.queuedLight; gowRuntime.action = 'idle'; gowRuntime.actionTimer = 0;
      if (nextQueued) triggerLightAttack(reduced);
      else if (gowRuntime.turnPhase === 'PLAYER_ANIMATING' && gowRuntime.divePhase === 'NONE') { if (gowRuntime.ap <= 0) startEnemyTurn(); else gowRuntime.turnPhase = 'PLAYER_TURN'; }
    }
  }
  const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z, flying = useGame.getState().flying;
  if (gowRuntime.action === 'idle') findFreeflowTarget(px, pz, 28.0);
  const list = gowRuntime.enemies;
  let execId = null as typeof gowRuntime.executableId, prompt = '';
  for (const e of list) {
    stepSingleEnemy(e, dt, px, py, pz, reduced);
    if ((e.state === 'stunned' || (e.state === 'stagger' && e.stun >= e.maxStun)) && Math.hypot(e.x - px, e.z - pz) <= 6.2) { execId = e.id; prompt = 'EXECUTE [E]'; }
    else if (!prompt && e.state === 'windup_red') prompt = '🌋 ALTAR QUAKE · EVADE ON WING [SPACE]';
  }
  if (flying && gowRuntime.lockedTargetId && gowRuntime.divePhase === 'NONE') prompt = '🦅 AERIAL LOCK • [1/CLICK] SWOOP STRIKE • [2/R-CLICK] SWORD BEAM';
  gowRuntime.executableId = execId; if (prompt) gowRuntime.threatPrompt = prompt;
  stepPrototypeLab(dt, reduced);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], sx = b.x - a.x, sz = b.z - a.z, sd = Math.hypot(sx, sz), minSep = (a.scale + b.scale) * 0.95;
    if (a.state !== 'dead' && b.state !== 'dead' && sd > 0.001 && sd < minSep) {
      const push = (minSep - sd) * 0.5; a.x -= (sx / sd) * push; a.z -= (sz / sd) * push; b.x += (sx / sd) * push; b.z += (sz / sd) * push;
    }
  }
  stepEnemyTurnSequence(dt);
  for (const s of gowRuntime.sparks) if (s.active) { s.life -= dt; if (s.life <= 0) s.active = false; else { s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vy -= 9.8 * dt; } }
  for (const p of gowRuntime.projectiles) if (p.active) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.life <= 0) { p.active = false; continue; }
    if (p.fromPlayer) {
      for (const e of list) if (e.state !== 'dead' && Math.hypot(e.x - p.x, (e.y + 1.0 * e.scale) - p.y, e.z - p.z) <= 2.4 * e.scale) {
        applyHitToEnemy(e, p.damage, p.stun, reduced, p.damage === 38 ? 'SWORD BEAM' : 'STAR-FALL VECTOR'); p.active = false;
        Object.assign(gowRuntime, { shockwaveTimer: 0.38, shockwaveColor: '#ffae42', shockwaveX: e.x, shockwaveZ: e.z }); break;
      }
      if (p.active && p.y <= 20.25) { p.active = false; spawnHitSparks(p.x, 20.2, p.z, '#ffd166', 6); Object.assign(gowRuntime, { shockwaveTimer: 0.35, shockwaveColor: '#ffd166', shockwaveX: p.x, shockwaveZ: p.z }); }
    } else if (Math.hypot(px - p.x, pz - p.z) <= 1.35 && Math.abs(py - p.y) <= 2.2) { damagePlayer(p.damage, list[2], false, reduced); p.active = false; }
  }
}

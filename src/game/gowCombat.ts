import { addTrauma, punchFov } from './cameraFx';
import { playImpactAudio, playParryAudio, playRageAudio, playSwingAudio } from './gowAudio';
import { combatMotion, FOOT } from './motion';
import { readIntent, runtime } from './runtime';
import { useGame } from './store';
import { ATTACK_SPECS, createInitialEnemies, gowRuntime, type GowEnemy, type GowPopup } from './gowTypes';

export function resetGowState() {
  Object.assign(gowRuntime, {
    hp: 100, rage: 40, rageActive: 0, action: 'idle', actionSeq: 0, actionTimer: 0, actionDuration: 0,
    hitDone: false, queuedLight: false, comboStep: 0, comboResetTimer: 0, comboHits: 0, comboBannerTimer: 0,
    lastMoveLabel: '', parryWindow: 0, dodgeInvuln: 0, runicCooldown: 0, hitstopTimer: 0, realmShiftTimer: 0,
    shockwaveTimer: 0, slashTimer: 0, lockedTargetId: null, executableId: null, threatPrompt: '',
    enemies: createInitialEnemies(),
  });
  for (const p of gowRuntime.projectiles) p.active = false;
  for (const s of gowRuntime.sparks) s.active = false;
  gowRuntime.popups.length = 0;
  combatMotion.vx = combatMotion.vy = combatMotion.vz = combatMotion.timer = 0;
}

export function pushPopup(text: string, tone: GowPopup['tone'], x: number, y: number, z: number) {
  if (gowRuntime.popups.length >= 8) gowRuntime.popups.shift();
  gowRuntime.popups.push({ id: gowRuntime.nextPopupId++, text, tone, x, y, z, age: 0 });
}

export function spawnHitSparks(x: number, y: number, z: number, color: string, count = 6) {
  for (let i = 0, spawned = 0; i < gowRuntime.sparks.length && spawned < count; i++) {
    const s = gowRuntime.sparks[i];
    if (s.active && s.life > 0.08) continue;
    const angle = (spawned / count) * Math.PI * 2 + gowRuntime.actionSeq * 0.7, spd = 3.2 + (spawned % 3) * 1.6;
    Object.assign(s, { active: true, x, y, z, vx: Math.cos(angle) * spd, vy: 2.4 + (spawned % 2) * 1.6, vz: Math.sin(angle) * spd, life: 0.32, maxLife: 0.32, color });
    spawned++;
  }
}

export function nearestLiveEnemy(px: number, pz: number, maxDist = 28): GowEnemy | null {
  let best: GowEnemy | null = null, bestD = maxDist;
  for (const e of gowRuntime.enemies) if (e.state !== 'dead' && Math.hypot(e.x - px, e.z - pz) < bestD) { bestD = Math.hypot(e.x - px, e.z - pz); best = e; }
  return best;
}

export function findFreeflowTarget(px: number, pz: number, maxDist = 14.0): GowEnemy | null {
  const intent = readIntent(), hasDir = Math.hypot(intent.forward, intent.strafe) > 0.15;
  const dirX = hasDir ? -Math.sin(runtime.yaw) * intent.forward + Math.cos(runtime.yaw) * intent.strafe : -Math.sin(runtime.yaw);
  const dirZ = hasDir ? -Math.cos(runtime.yaw) * intent.forward - Math.sin(runtime.yaw) * intent.strafe : -Math.cos(runtime.yaw);
  const dLen = Math.max(0.001, Math.hypot(dirX, dirZ)), nx = dirX / dLen, nz = dirZ / dLen;
  let best: GowEnemy | null = null, bestScore = Infinity;
  for (const e of gowRuntime.enemies) {
    if (e.state === 'dead') continue;
    const dx = e.x - px, dz = e.z - pz, dist = Math.hypot(dx, dz);
    if (dist > maxDist) continue;
    const score = dist - (dist > 0.1 ? (dx / dist) * nx + (dz / dist) * nz : 1) * (hasDir ? 3.5 : 1.6);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  gowRuntime.lockedTargetId = best?.id ?? null;
  return best;
}

function orientAndLunge(baseSpeed: number, lungeDuration: number, reduced: boolean) {
  combatMotion.vy = 0;
  const px = runtime.position.x, pz = runtime.position.z, target = findFreeflowTarget(px, pz, 13.5);
  if (target) {
    const dx = target.x - px, dz = target.z - pz, dist = Math.hypot(dx, dz);
    if (dist > 0.05) runtime.yaw = Math.atan2(-dx, -dz);
    if (lungeDuration > 0 && dist > 0.05) {
      const gap = Math.max(0, dist - 2.0), vaultSpeed = Math.min(reduced ? 7.5 : 22.0, gap > 0.25 ? Math.max(baseSpeed, gap / lungeDuration) : 0);
      Object.assign(combatMotion, { vx: (dx / dist) * vaultSpeed, vz: (dz / dist) * vaultSpeed, timer: vaultSpeed > 0 ? lungeDuration : 0 });
    }
    return;
  }
  if (baseSpeed > 0 && lungeDuration > 0) Object.assign(combatMotion, { vx: -Math.sin(runtime.yaw) * baseSpeed, vz: -Math.cos(runtime.yaw) * baseSpeed, timer: lungeDuration });
}

function startSpecAttack(key: keyof typeof ATTACK_SPECS, reduced: boolean) {
  const spec = ATTACK_SPECS[key];
  Object.assign(gowRuntime, { action: spec.action, actionSeq: gowRuntime.actionSeq + 1, actionTimer: 0, actionDuration: spec.duration, hitDone: false, lastMoveLabel: spec.label, comboBannerTimer: 2.0 });
  if (key !== 'runic') {
    const dur = spec.duration * 0.82, color = key === 'heavy' || key === 'light4' || key === 'rage_slam' || key === 'swoop' ? '#ff9f1c' : key === 'counter' || key === 'sky_beam' ? '#5ee6d0' : '#ffd166';
    Object.assign(gowRuntime, { slashDuration: dur, slashTimer: dur, slashTilt: spec.slashTilt, slashSpin: spec.spinTurns, slashColor: color });
  }
  if (key !== 'swoop' && key !== 'sky_beam') orientAndLunge(spec.lungeSpeed, spec.lungeDuration, reduced);
}

export function applyHitToEnemy(e: GowEnemy, damage: number, stun: number, reduced: boolean, tag?: string) {
  if (e.state === 'dead') return;
  const dmg = Math.round(damage * (gowRuntime.rageActive > 0 ? 1.35 : 1) * (e.state === 'stunned' ? 1.25 : 1));
  e.hp = Math.max(0, e.hp - dmg); e.flashTimer = 0.20;
  gowRuntime.rage = Math.min(gowRuntime.maxRage, gowRuntime.rage + 8); gowRuntime.comboHits++; gowRuntime.comboBannerTimer = 2.2;
  const dx = e.x - runtime.position.x, dz = e.z - runtime.position.z, dist = Math.max(0.1, Math.hypot(dx, dz)), kb = damage >= 45 || stun >= 40 ? 7.2 : 3.8;
  e.vx = (dx / dist) * kb; e.vz = (dz / dist) * kb;
  spawnHitSparks(e.x, e.y + 1.15 * e.scale, e.z, stun >= 30 ? '#ff9f1c' : '#ffd166', damage >= 45 ? 10 : 6);
  playImpactAudio(damage >= 32 || stun >= 30);
  if (e.hp <= 0) {
    Object.assign(e, { state: 'dead', stateTimer: 0, stateDuration: 2.6, respawnTimer: e.isBoss ? 7.0 : 5.0 });
    pushPopup(`${e.name.toUpperCase()} FELLED`, 'gold', e.x, e.y + 2.2 * e.scale, e.z);
    if (!reduced) { punchFov(runtime.shooter.camFx, 'kill', 2.4); addTrauma(runtime.shooter.camFx, 0.55); }
    return;
  }
  e.stun = Math.min(e.maxStun, e.stun + stun);
  if (e.stun >= e.maxStun && e.state !== 'stunned') {
    Object.assign(e, { state: 'stunned', stateTimer: 0, stateDuration: 4.5 });
    pushPopup('STUNNED · PRESS E!', 'stun', e.x, e.y + 2.1 * e.scale, e.z);
  } else if (e.state !== 'stunned' && (stun >= 20 || !e.isBoss || e.state === 'idle' || e.state === 'chase')) {
    Object.assign(e, { state: 'stagger', stateTimer: 0, stateDuration: 0.52 });
  }
  pushPopup(tag ? `${tag} -${dmg}` : `-${dmg}`, stun >= 30 ? 'stun' : 'gold', e.x, e.y + 1.8 * e.scale, e.z);
}

export function triggerAerialSwoop(reduced = false): boolean {
  const px = runtime.position.x, py = runtime.position.y, pz = runtime.position.z, target = findFreeflowTarget(px, pz, 28.0);
  startSpecAttack('swoop', reduced); playSwingAudio(4);
  const diveDur = 0.34;
  if (target) {
    const dx = target.x - px, dz = target.z - pz, dist = Math.hypot(dx, dz), gap = Math.max(0, dist - 1.8);
    if (dist > 0.05) runtime.yaw = Math.atan2(-dx, -dz);
    Object.assign(combatMotion, { vx: dist > 0.05 ? (dx / dist) * (gap / diveDur) : 0, vz: dist > 0.05 ? (dz / dist) * (gap / diveDur) : 0, vy: ((target.y + FOOT) - py) / diveDur, timer: diveDur });
  } else Object.assign(combatMotion, { vx: -Math.sin(runtime.yaw) * 15, vz: -Math.cos(runtime.yaw) * 15, vy: ((20 + FOOT) - py) / diveDur, timer: diveDur });
  return true;
}

export function triggerSkySwordBeam(reduced = false): boolean {
  if (gowRuntime.action === 'sky_beam' && gowRuntime.actionTimer < 0.25) return false;
  const px = runtime.position.x, pz = runtime.position.z, target = findFreeflowTarget(px, pz, 28.0);
  if (target && Math.hypot(target.x - px, target.z - pz) > 0.05) runtime.yaw = Math.atan2(-(target.x - px), -(target.z - pz));
  startSpecAttack('sky_beam', reduced); playSwingAudio(3); return true;
}

export function triggerStunExecute(reduced = false): boolean {
  const px = runtime.position.x, pz = runtime.position.z;
  const stunned = gowRuntime.enemies.find(e => (e.state === 'stunned' || (e.state === 'stagger' && e.stun >= e.maxStun)) && Math.hypot(e.x - px, e.z - pz) <= 6.2);
  if (!stunned) return false;
  stunned.stun = 0; startSpecAttack('execute', reduced); playRageAudio();
  gowRuntime.hp = Math.min(gowRuntime.maxHp, gowRuntime.hp + 25); gowRuntime.rage = Math.min(gowRuntime.maxRage, gowRuntime.rage + 25);
  Object.assign(gowRuntime, { shockwaveTimer: 0.45, shockwaveColor: '#ffae42', shockwaveX: stunned.x, shockwaveY: stunned.y + 0.15, shockwaveZ: stunned.z, shockwaveMaxR: 4.8 });
  return true;
}

export function triggerLightAttack(reduced = false): boolean {
  if (useGame.getState().flying) return triggerAerialSwoop(reduced);
  if (gowRuntime.action === 'idle' && triggerStunExecute(reduced)) return true;
  if (gowRuntime.action !== 'idle' && gowRuntime.actionTimer < gowRuntime.actionDuration * 0.72) {
    if (gowRuntime.action === 'light1' || gowRuntime.action === 'light2' || gowRuntime.action === 'light3') { gowRuntime.queuedLight = true; return true; }
    return false;
  }
  const nextStep = gowRuntime.comboResetTimer > 0 ? (gowRuntime.comboStep % 4) + 1 : 1;
  Object.assign(gowRuntime, { comboStep: nextStep, comboResetTimer: 1.45, queuedLight: false });
  startSpecAttack((['light1', 'light2', 'light3', 'light4'] as const)[nextStep - 1], reduced); playSwingAudio(nextStep); return true;
}

export function triggerHeavyBash(reduced = false): boolean {
  if (useGame.getState().flying) return triggerSkySwordBeam(reduced);
  if (gowRuntime.action !== 'idle' && gowRuntime.actionTimer < gowRuntime.actionDuration * 0.65) return false;
  gowRuntime.queuedLight = false; startSpecAttack('heavy', reduced); playSwingAudio(5); return true;
}

export function triggerParry(reduced = false): boolean {
  if (useGame.getState().flying) return triggerSkySwordBeam(reduced);
  const px = runtime.position.x, pz = runtime.position.z;
  const attacker = gowRuntime.enemies.find(e => ((e.state === 'windup_yellow' && !e.hitDealt) || e.state === 'strike') && Math.hypot(e.x - px, e.z - pz) <= 8.5);
  playParryAudio();
  if (attacker) {
    gowRuntime.lockedTargetId = attacker.id; startSpecAttack('counter', reduced);
    gowRuntime.parryWindow = 0.45; gowRuntime.hitDone = true;
    Object.assign(attacker, { state: 'stagger', stateTimer: 0, stateDuration: 1.25, hitDealt: true });
    applyHitToEnemy(attacker, 36, 55, reduced, 'ARKHAM RIPOSTE');
    Object.assign(gowRuntime, { shockwaveTimer: 0.45, shockwaveColor: '#5ee6d0', shockwaveX: attacker.x, shockwaveY: attacker.y + 0.1, shockwaveZ: attacker.z, shockwaveMaxR: 5.5 });
    if (!reduced) { gowRuntime.hitstopTimer = 0.075; punchFov(runtime.shooter.camFx, 'shot', 1.9); }
    return true;
  }
  Object.assign(gowRuntime, { action: 'parry', actionSeq: gowRuntime.actionSeq + 1, actionTimer: 0, actionDuration: 0.36, parryWindow: 0.35, lastMoveLabel: 'AEGIS PARRY', comboBannerTimer: 1.2 });
  return true;
}

export function triggerDodgeRoll(_reduced = false): boolean {
  Object.assign(gowRuntime, { action: 'dodge', actionSeq: gowRuntime.actionSeq + 1, actionTimer: 0, actionDuration: 0.48, dodgeInvuln: 0.42, queuedLight: false, lastMoveLabel: 'EVADE ROLL', comboBannerTimer: 1.2 });
  const intent = readIntent(), fwd = Math.abs(intent.forward) > 0.1 || Math.abs(intent.strafe) > 0.1 ? intent.forward : -1;
  const wx = -Math.sin(runtime.yaw) * fwd + Math.cos(runtime.yaw) * intent.strafe, wz = -Math.cos(runtime.yaw) * fwd - Math.sin(runtime.yaw) * intent.strafe, len = Math.max(0.001, Math.hypot(wx, wz));
  Object.assign(combatMotion, { vx: (wx / len) * 10.2, vy: 0, vz: (wz / len) * 10.2, timer: 0.36 });
  const px = runtime.position.x, pz = runtime.position.z;
  if (gowRuntime.enemies.some(e => e.state === 'windup_red' && Math.hypot(e.x - px, e.z - pz) <= 8.0)) {
    gowRuntime.realmShiftTimer = 1.5; pushPopup('REALM SHIFT · TIME SLOWED!', 'parry', px, runtime.position.y + 1.2, pz);
  }
  return true;
}

export function triggerRunicSpell(reduced = false): boolean {
  if (useGame.getState().flying) return triggerSkySwordBeam(reduced);
  if (gowRuntime.runicCooldown > 0) return false;
  gowRuntime.runicCooldown = 5.0; startSpecAttack('runic', reduced); playSwingAudio(4); return true;
}

export function triggerWingedRage(reduced = false): boolean {
  if (gowRuntime.rage < 35 && gowRuntime.rageActive <= 0) return false;
  if (gowRuntime.rageActive <= 0) { gowRuntime.rage = Math.max(0, gowRuntime.rage - 35); gowRuntime.rageActive = 8.0; gowRuntime.hp = Math.min(gowRuntime.maxHp, gowRuntime.hp + 35); }
  startSpecAttack('rage_slam', reduced); playRageAudio();
  Object.assign(gowRuntime, { shockwaveTimer: 0.55, shockwaveColor: '#ffcf5c', shockwaveX: runtime.position.x, shockwaveY: runtime.position.y - 0.95, shockwaveZ: runtime.position.z, shockwaveMaxR: 7.2 });
  return true;
}

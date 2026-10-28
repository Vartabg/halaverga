import { addTrauma, kick, punchFov } from './cameraFx';
import { combatMotion } from './motion';
import { readIntent, runtime } from './runtime';
import { ATTACK_SPECS, createInitialEnemies, gowRuntime, type GowAction, type GowEnemy, type GowPopup } from './gowTypes';

export function resetGowState() {
  gowRuntime.hp = 100; gowRuntime.rage = 40; gowRuntime.rageActive = 0;
  gowRuntime.action = 'idle'; gowRuntime.actionTimer = 0; gowRuntime.actionDuration = 0;
  gowRuntime.hitDone = false; gowRuntime.queuedLight = false; gowRuntime.comboStep = 0;
  gowRuntime.comboResetTimer = 0; gowRuntime.comboHits = 0; gowRuntime.comboBannerTimer = 0;
  gowRuntime.lastMoveLabel = ''; gowRuntime.parryWindow = 0; gowRuntime.dodgeInvuln = 0;
  gowRuntime.runicCooldown = 0; gowRuntime.hitstopTimer = 0; gowRuntime.realmShiftTimer = 0;
  gowRuntime.shockwaveTimer = 0; gowRuntime.executableId = null; gowRuntime.threatPrompt = '';
  gowRuntime.enemies = createInitialEnemies();
  for (const p of gowRuntime.projectiles) p.active = false;
  gowRuntime.popups.length = 0;
  combatMotion.vx = combatMotion.vz = combatMotion.timer = 0;
}

export function pushPopup(text: string, tone: GowPopup['tone'], x: number, y: number, z: number) {
  if (gowRuntime.popups.length >= 8) gowRuntime.popups.shift();
  gowRuntime.popups.push({ id: gowRuntime.nextPopupId++, text, tone, x, y, z, age: 0 });
}

export function nearestLiveEnemy(px: number, pz: number, maxDist = 24): GowEnemy | null {
  let best: GowEnemy | null = null, bestD = maxDist;
  for (const e of gowRuntime.enemies) {
    if (e.state === 'dead') continue;
    const d = Math.hypot(e.x - px, e.z - pz);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function orientAndLunge(lungeSpeed: number, lungeDuration: number, reduced: boolean) {
  const px = runtime.position.x, pz = runtime.position.z;
  const target = nearestLiveEnemy(px, pz, 9.5);
  if (target) {
    const dx = target.x - px, dz = target.z - pz;
    const desiredYaw = Math.atan2(-dx, -dz);
    if (!reduced) runtime.yaw = desiredYaw;
  }
  if (lungeSpeed > 0 && lungeDuration > 0) {
    combatMotion.vx = -Math.sin(runtime.yaw) * lungeSpeed;
    combatMotion.vz = -Math.cos(runtime.yaw) * lungeSpeed;
    combatMotion.timer = lungeDuration;
  }
}

function startSpecAttack(key: keyof typeof ATTACK_SPECS, reduced: boolean) {
  const spec = ATTACK_SPECS[key];
  gowRuntime.action = spec.action;
  gowRuntime.actionTimer = 0;
  gowRuntime.actionDuration = spec.duration;
  gowRuntime.hitDone = false;
  gowRuntime.lastMoveLabel = spec.label;
  gowRuntime.comboBannerTimer = 1.6;
  orientAndLunge(spec.lungeSpeed, spec.lungeDuration, reduced);
}

export function applyHitToEnemy(e: GowEnemy, damage: number, stun: number, reduced: boolean, tag?: string) {
  if (e.state === 'dead') return;
  const mult = (gowRuntime.rageActive > 0 ? 1.35 : 1) * (e.state === 'stunned' ? 1.25 : 1);
  const dmg = Math.round(damage * mult);
  e.hp = Math.max(0, e.hp - dmg);
  e.flashTimer = 0.18;
  gowRuntime.rage = Math.min(gowRuntime.maxRage, gowRuntime.rage + 7);
  gowRuntime.comboHits++;
  gowRuntime.comboBannerTimer = 2.0;

  if (e.hp <= 0) {
    e.state = 'dead'; e.stateTimer = 0; e.stateDuration = 2.6;
    e.clip = 'Death01'; e.clipSpeed = 1.0; e.respawnTimer = e.isBoss ? 7.0 : 5.0;
    pushPopup(`${e.name.toUpperCase()} FELLED`, 'gold', e.x, e.y + 2.2 * e.scale, e.z);
    if (!reduced) { punchFov(runtime.shooter.camFx, 'kill', 2.4); addTrauma(runtime.shooter.camFx, 0.55); }
    return;
  }
  e.stun = Math.min(e.maxStun, e.stun + stun);
  if (e.stun >= e.maxStun && e.state !== 'stunned') {
    e.state = 'stunned'; e.stateTimer = 0; e.stateDuration = 4.5;
    e.clip = 'Hit_Head'; e.clipSpeed = 0.65;
    pushPopup('STUNNED · PRESS E!', 'stun', e.x, e.y + 2.1 * e.scale, e.z);
  } else if (e.state !== 'stunned' && (stun >= 22 || !e.isBoss || e.state === 'idle' || e.state === 'chase')) {
    e.state = 'stagger'; e.stateTimer = 0; e.stateDuration = 0.48;
    e.clip = stun >= 30 ? 'Hit_Head' : 'Hit_Chest'; e.clipSpeed = 1.2;
  }
  pushPopup(tag ? `${tag} -${dmg}` : `-${dmg}`, stun >= 30 ? 'stun' : 'gold', e.x, e.y + 1.8 * e.scale, e.z);
}

export function triggerStunExecute(reduced = false): boolean {
  const px = runtime.position.x, pz = runtime.position.z;
  const stunned = gowRuntime.enemies.find(e => (e.state === 'stunned' || (e.state === 'stagger' && e.stun >= e.maxStun)) && Math.hypot(e.x - px, e.z - pz) <= 5.2);
  if (!stunned) return false;
  stunned.stun = 0;
  startSpecAttack('execute', reduced);
  gowRuntime.hp = Math.min(gowRuntime.maxHp, gowRuntime.hp + 25);
  gowRuntime.rage = Math.min(gowRuntime.maxRage, gowRuntime.rage + 25);
  gowRuntime.shockwaveTimer = 0.45; gowRuntime.shockwaveColor = '#ffae42';
  gowRuntime.shockwaveX = stunned.x; gowRuntime.shockwaveY = stunned.y + 0.15; gowRuntime.shockwaveZ = stunned.z; gowRuntime.shockwaveMaxR = 4.8;
  return true;
}

export function triggerLightAttack(reduced = false): boolean {
  if (gowRuntime.action === 'idle' && triggerStunExecute(reduced)) return true;
  if (gowRuntime.action === 'light1' || gowRuntime.action === 'light2') {
    gowRuntime.queuedLight = true;
    return true;
  }
  if (gowRuntime.action !== 'idle' && gowRuntime.actionTimer < gowRuntime.actionDuration * 0.72) return false;
  const nextStep = gowRuntime.comboResetTimer > 0 ? (gowRuntime.comboStep % 3) + 1 : 1;
  gowRuntime.comboStep = nextStep;
  gowRuntime.comboResetTimer = 1.25;
  gowRuntime.queuedLight = false;
  startSpecAttack(nextStep === 1 ? 'light1' : nextStep === 2 ? 'light2' : 'light3', reduced);
  return true;
}

export function triggerHeavyBash(reduced = false): boolean {
  if (gowRuntime.action !== 'idle' && gowRuntime.actionTimer < gowRuntime.actionDuration * 0.65) return false;
  gowRuntime.queuedLight = false;
  startSpecAttack('heavy', reduced);
  return true;
}

export function triggerParry(reduced = false): boolean {
  gowRuntime.action = 'parry'; gowRuntime.actionTimer = 0; gowRuntime.actionDuration = 0.36;
  gowRuntime.parryWindow = 0.32; gowRuntime.lastMoveLabel = 'AEGIS PARRY'; gowRuntime.comboBannerTimer = 1.2;
  const px = runtime.position.x, pz = runtime.position.z;
  for (const e of gowRuntime.enemies) {
    if (e.state !== 'windup_yellow' && e.state !== 'strike') continue;
    if (Math.hypot(e.x - px, e.z - pz) <= 5.8) {
      e.state = 'stagger'; e.stateTimer = 0; e.stateDuration = 1.1; e.clip = 'Hit_Head'; e.clipSpeed = 0.9;
      applyHitToEnemy(e, 18, 45, reduced, 'PARRY COUNTER');
      gowRuntime.shockwaveTimer = 0.42; gowRuntime.shockwaveColor = '#ffe58f';
      gowRuntime.shockwaveX = px; gowRuntime.shockwaveY = runtime.position.y - 0.9; gowRuntime.shockwaveZ = pz; gowRuntime.shockwaveMaxR = 5.2;
      if (!reduced) { gowRuntime.hitstopTimer = 0.075; punchFov(runtime.shooter.camFx, 'shot', 1.8); }
    }
  }
  return true;
}

export function triggerDodgeRoll(_reduced = false): boolean {
  gowRuntime.action = 'dodge'; gowRuntime.actionTimer = 0; gowRuntime.actionDuration = 0.50;
  gowRuntime.dodgeInvuln = 0.40; gowRuntime.queuedLight = false;
  gowRuntime.lastMoveLabel = 'EVADE ROLL'; gowRuntime.comboBannerTimer = 1.1;
  const intent = readIntent();
  const fwd = Math.abs(intent.forward) > 0.1 || Math.abs(intent.strafe) > 0.1 ? intent.forward : -1;
  const str = intent.strafe;
  const wx = -Math.sin(runtime.yaw) * fwd + Math.cos(runtime.yaw) * str;
  const wz = -Math.cos(runtime.yaw) * fwd - Math.sin(runtime.yaw) * str;
  const len = Math.max(0.001, Math.hypot(wx, wz));
  combatMotion.vx = (wx / len) * 9.5; combatMotion.vz = (wz / len) * 9.5; combatMotion.timer = 0.36;

  const px = runtime.position.x, pz = runtime.position.z;
  const redThreat = gowRuntime.enemies.some(e => e.state === 'windup_red' && Math.hypot(e.x - px, e.z - pz) <= 7.5);
  if (redThreat) {
    gowRuntime.realmShiftTimer = 1.45;
    pushPopup('REALM SHIFT · TIME SLOWED!', 'parry', px, runtime.position.y + 1.2, pz);
  }
  return true;
}

export function triggerRunicSpell(reduced = false): boolean {
  if (gowRuntime.runicCooldown > 0) return false;
  gowRuntime.runicCooldown = 5.0;
  startSpecAttack('runic', reduced);
  return true;
}

export function triggerWingedRage(reduced = false): boolean {
  if (gowRuntime.rage < 35 && gowRuntime.rageActive <= 0) return false;
  if (gowRuntime.rageActive <= 0) {
    gowRuntime.rage = Math.max(0, gowRuntime.rage - 35);
    gowRuntime.rageActive = 8.0;
    gowRuntime.hp = Math.min(gowRuntime.maxHp, gowRuntime.hp + 35);
  }
  startSpecAttack('rage_slam', reduced);
  gowRuntime.shockwaveTimer = 0.55; gowRuntime.shockwaveColor = '#ffcf5c';
  gowRuntime.shockwaveX = runtime.position.x; gowRuntime.shockwaveY = runtime.position.y - 0.95; gowRuntime.shockwaveZ = runtime.position.z;
  gowRuntime.shockwaveMaxR = 7.2;
  return true;
}

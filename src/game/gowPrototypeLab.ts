import { addTrauma, punchFov } from './cameraFx';
import { playImpactAudio, playParryAudio, playRageAudio, playSwingAudio } from './gowAudio';
import { applyHitToEnemy, executeTurnCommand, markDuelEngaged, pushPopup, resetGowState, selectTarget, spawnHitSparks, triggerHeavyBash, triggerRunicSpell } from './gowCombat';
import { gowRuntime, type DemoMode } from './gowTypes';
import { FOOT, setVec } from './motion';
import { presentation } from './presentation';
import { runtime, stopTrackpad } from './runtime';
import { useGame } from './store';

export function triggerCutIn(title: string, sub: string, portrait = '/sprites/cutin-uriel.jpg') {
  Object.assign(gowRuntime, { cutInTimer: 1.45, cutInTitle: title, cutInSub: sub, cutInPortrait: portrait });
}

export function switchDemoMode(mode: DemoMode) {
  markDuelEngaged(); resetGowState(); gowRuntime.demoMode = mode; stopTrackpad(); runtime.landGoal = null;
  if (mode === 'clash') {
    useGame.setState({ flying: false, landing: false });
    setVec(runtime.position, 0, 20 + FOOT, 64.5); setVec(presentation.position, 0, 20 + FOOT, 64.5);
    selectTarget('nephilim-west');
    gowRuntime.threatPrompt = '💥 DIORAMA CLASH • LAUNCH VANGUARDS INTO SEMJAZA OR PILLARS';
    triggerCutIn('DIORAMA CLASH', 'KNOCKBACK CHAIN COLLISIONS ACTIVE', '/sprites/cutin-uriel.jpg');
  } else if (mode === 'sigil') {
    useGame.setState({ flying: false, landing: false });
    setVec(runtime.position, 0, 20 + FOOT, 64.5); setVec(presentation.position, 0, 20 + FOOT, 64.5);
    gowRuntime.oathTethers = [true, true]; gowRuntime.sigilPrism = false; selectTarget('nephilim-west');
    gowRuntime.threatPrompt = '📐 SIGIL WEAVER • SWIPE CRIMSON OATH-TETHERS OR CAST PRISM';
    triggerCutIn('SIGIL WEAVER', 'OATH TETHERS SHIELD SEMJAZA • SEVER THEM!', '/sprites/cutin-semjaza.jpg');
  } else {
    useGame.setState({ flying: true, landing: false });
    Object.assign(gowRuntime, { divePhase: 'BREACH_AIM', diveTimer: 0, ap: 2 });
    setVec(runtime.position, 0, 33.5, 75.0); setVec(runtime.velocity, 0, 0, 0); setVec(presentation.position, 0, 33.5, 75.0);
    selectTarget('semjaza-boss');
    gowRuntime.threatPrompt = '🦅 DIVE-TO-DUEL • CHOOSE SPLINE BREACH TRAJECTORY';
    triggerCutIn('SUMMIT OVERLOOK', 'SELECT SPLINE BREACH VECTOR BELOW', '/sprites/cutin-uriel.jpg');
  }
}

export function stepKnockbackCollisions(reduced: boolean) {
  if (gowRuntime.collisionCooldown > 0) return;
  const list = gowRuntime.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.state === 'dead' || Math.hypot(a.vx, a.vz) < 2.2) continue;
    for (let j = 0; j < list.length; j++) {
      if (i === j || list[j].state === 'dead') continue;
      const b = list[j], d = Math.hypot(b.x - a.x, b.z - a.z), hitDist = Math.max(2.6, (a.scale + b.scale) * 0.99);
      if (d <= hitDist) {
        a.vx = a.vz = b.vx = b.vz = 0; gowRuntime.collisionCooldown = 0.45; gowRuntime.collisionsTriggered++;
        applyHitToEnemy(a, 38, 45, reduced, 'CHAIN COLLISION'); applyHitToEnemy(b, 42, 50, reduced, 'CHAIN COLLISION');
        Object.assign(gowRuntime, { shockwaveTimer: 0.52, shockwaveColor: '#ff9f1c', shockwaveX: (a.x + b.x) * 0.5, shockwaveY: 20.15, shockwaveZ: (a.z + b.z) * 0.5, shockwaveMaxR: 6.5 });
        triggerCutIn('CHAIN COLLISION!', `${a.name.split(' ')[0].toUpperCase()} CRASHED INTO ${b.name.split(' ')[0].toUpperCase()}`, '/sprites/cutin-semjaza.jpg');
        return;
      }
    }
    if (Math.hypot(a.x, a.z - 55) >= 17.5) {
      a.vx = a.vz = 0; gowRuntime.collisionCooldown = 0.45; gowRuntime.collisionsTriggered++;
      applyHitToEnemy(a, 36, 50, reduced, 'PILLAR SLAM');
      Object.assign(gowRuntime, { shockwaveTimer: 0.48, shockwaveColor: '#ffd166', shockwaveX: a.x, shockwaveY: 20.15, shockwaveZ: a.z, shockwaveMaxR: 5.5 });
      triggerCutIn('PILLAR SLAM!', `${a.name.toUpperCase()} SMASHED SANCTUARY PILLAR`, '/sprites/cutin-uriel.jpg');
      return;
    }
  }
}

function segmentsIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const ccw = (p1x: number, p1z: number, p2x: number, p2z: number, p3x: number, p3z: number) => (p3z - p1z) * (p2x - p1x) > (p2z - p1z) * (p3x - p1x);
  return ccw(ax, az, cx, cz, dx, dz) !== ccw(bx, bz, cx, cz, dx, dz) && ccw(ax, az, bx, bz, cx, cz) !== ccw(ax, az, bx, bz, dx, dz);
}

export function severTetherIndex(idx: 0 | 1, reduced: boolean): boolean {
  if (gowRuntime.turnPhase !== 'PLAYER_TURN' || gowRuntime.ap < 1 || !gowRuntime.oathTethers[idx]) return false;
  const guard = gowRuntime.enemies[idx], boss = gowRuntime.enemies[2], mx = (guard.x + boss.x) * 0.5, mz = (guard.z + boss.z) * 0.5;
  gowRuntime.oathTethers[idx] = false; gowRuntime.ap -= 1; gowRuntime.collisionsTriggered++;
  Object.assign(gowRuntime, {
    turnPhase: 'PLAYER_ANIMATING', action: 'sky_beam', actionSeq: gowRuntime.actionSeq + 1, actionTimer: 0, actionDuration: 0.38, hitDone: true,
    sigilStartX: mx - 2.6, sigilStartZ: mz - 1.2, sigilEndX: mx + 2.6, sigilEndZ: mz + 1.2, sigilRibbonTimer: 0.65,
    shockwaveTimer: 0.48, shockwaveColor: '#5ee6d0', shockwaveX: mx, shockwaveY: 20.15, shockwaveZ: mz,
  });
  playParryAudio(); applyHitToEnemy(guard, 42, 55, reduced, 'OATH SEVERED');
  if (boss && boss.state !== 'dead') applyHitToEnemy(boss, 28, 35, reduced, 'OATH SHOCK');
  triggerCutIn('OATH TETHER SEVERED!', `${guard.name.toUpperCase()} LINK SHATTERED`, '/sprites/cutin-uriel.jpg');
  return true;
}

export function handleSigilSwipe(x0: number, z0: number, x1: number, z1: number, reduced: boolean): boolean {
  if (gowRuntime.demoMode !== 'sigil' || gowRuntime.turnPhase !== 'PLAYER_TURN' || gowRuntime.ap < 1) return false;
  const boss = gowRuntime.enemies[2]; if (!boss || boss.state === 'dead') return false;
  for (const idx of [0, 1] as const) {
    const g = gowRuntime.enemies[idx]; if (!gowRuntime.oathTethers[idx] || g.state === 'dead') continue;
    const mx = (g.x + boss.x) * 0.5, mz = (g.z + boss.z) * 0.5;
    if (segmentsIntersect(x0, z0, x1, z1, g.x, g.z, boss.x, boss.z) || Math.hypot((x0 + x1) * 0.5 - mx, (z0 + z1) * 0.5 - mz) <= 2.4) {
      const ok = severTetherIndex(idx, reduced);
      if (ok) Object.assign(gowRuntime, { sigilStartX: x0, sigilStartZ: z0, sigilEndX: x1, sigilEndZ: z1 });
      return ok;
    }
  }
  return false;
}

export function launchDiveBreach(style: 'meteor' | 'flank' | 'solar', reduced: boolean): boolean {
  if (gowRuntime.divePhase !== 'BREACH_AIM') return false;
  Object.assign(gowRuntime, { divePhase: 'DIVING', diveStyle: style, diveTimer: 0, diveDuration: 0.62, turnPhase: 'PLAYER_ANIMATING' });
  playSwingAudio(4);
  triggerCutIn(style === 'meteor' ? 'METEOR BREACH DIVE' : style === 'flank' ? 'WINGED FLANK GLIDE' : 'SOLAR HALO DROP', style === 'meteor' ? 'SHATTER ALL WATCHER SHIELDS' : style === 'flank' ? 'SKY STANCE • +3 AP & WARD' : '100% RAGE • SOLAR BURN AOE');
  if (!reduced) punchFov(runtime.shooter.camFx, 'shot', 2.2);
  return true;
}

export function executeModeCommand(slot: 1 | 2 | 3 | 4 | 5, reduced = false): boolean {
  markDuelEngaged();
  if (gowRuntime.outcome !== 'ONGOING') { switchDemoMode(gowRuntime.demoMode); return true; }
  const mode = gowRuntime.demoMode, flying = useGame.getState().flying;
  if (slot === 5) { if (mode === 'dive' && gowRuntime.divePhase === 'NONE') { switchDemoMode('dive'); return true; } return executeTurnCommand('end', reduced); }
  if (mode === 'dive' && gowRuntime.divePhase === 'BREACH_AIM') return launchDiveBreach(slot === 2 ? 'flank' : slot === 3 ? 'solar' : 'meteor', reduced);
  if (gowRuntime.turnPhase !== 'PLAYER_TURN') return false;
  if (mode === 'clash' && slot === 1) {
    if (gowRuntime.ap < 1) return false;
    gowRuntime.ap -= 1; Object.assign(gowRuntime, { turnPhase: 'PLAYER_ANIMATING', returnAfterStrike: true, homeX: runtime.position.x, homeZ: runtime.position.z });
    triggerCutIn('VECTOR RAM', 'HIGH-VELOCITY KNOCKBACK LAUNCH');
    return flying ? executeTurnCommand('swoop', reduced) : triggerHeavyBash(reduced);
  }
  if (mode === 'sigil') {
    if (slot === 1) {
      const idx: 0 | 1 = gowRuntime.lockedTargetId === 'nephilim-east' && gowRuntime.oathTethers[1] ? 1 : gowRuntime.oathTethers[0] ? 0 : 1;
      return gowRuntime.oathTethers[idx] ? severTetherIndex(idx, reduced) : executeTurnCommand('slash', reduced);
    }
    if (slot === 2) {
      if (gowRuntime.ap < 1) return false;
      gowRuntime.ap -= 1; gowRuntime.turnPhase = 'PLAYER_ANIMATING'; gowRuntime.runicCooldown = 0;
      triggerCutIn('STAR-FALL VECTOR', 'ORBITAL CONSTELLATION BEAM'); return triggerRunicSpell(reduced);
    }
    if (slot === 3) {
      if (gowRuntime.ap < 1) return false;
      gowRuntime.ap -= 1; gowRuntime.sigilPrism = true; gowRuntime.guardWard = true; playParryAudio();
      pushPopup('🔺 ENOCHIAN PRISM • 100% REFLECT ARMED!', 'parry', runtime.position.x, runtime.position.y + 1.3, runtime.position.z);
      triggerCutIn('ENOCHIAN PRISM', 'REFLECTS NEXT WATCHER STRIKE (45 DMG)');
      if (gowRuntime.ap <= 0) executeTurnCommand('end', reduced);
      return true;
    }
  }
  return executeTurnCommand(slot === 1 ? (flying ? 'swoop' : 'slash') : slot === 2 ? (flying ? 'beam' : 'ward') : slot === 3 ? 'wing' : 'rage', reduced);
}

export function stepPrototypeLab(dt: number, reduced: boolean) {
  gowRuntime.cutInTimer = Math.max(0, gowRuntime.cutInTimer - dt);
  gowRuntime.sigilRibbonTimer = Math.max(0, gowRuntime.sigilRibbonTimer - dt);
  gowRuntime.collisionCooldown = Math.max(0, gowRuntime.collisionCooldown - dt);
  stepKnockbackCollisions(reduced);
  for (let i = 0; i < 2; i++) if (gowRuntime.enemies[i]?.state === 'dead') gowRuntime.oathTethers[i] = false;
  if (gowRuntime.divePhase === 'BREACH_AIM') {
    setVec(runtime.position, 0, 33.5, 75.0); setVec(runtime.velocity, 0, 0, 0); setVec(presentation.position, 0, 33.5, 75.0);
  } else if (gowRuntime.divePhase === 'DIVING') {
    gowRuntime.diveTimer += dt;
    const t = Math.min(1, gowRuntime.diveTimer / gowRuntime.diveDuration), ease = t * t * (3 - 2 * t), style = gowRuntime.diveStyle;
    const endX = style === 'flank' ? -3.2 : 0, endY = style === 'flank' ? 24.8 : 20 + FOOT, endZ = style === 'meteor' ? 56.5 : 63.5;
    setVec(runtime.position, endX * ease + (style === 'flank' ? Math.sin(t * Math.PI) * -6.5 : 0), 33.5 + (endY - 33.5) * ease + Math.sin(t * Math.PI) * 2.5, 75.0 + (endZ - 75.0) * ease);
    setVec(presentation.position, runtime.position.x, runtime.position.y, runtime.position.z);
    if (t >= 1) {
      gowRuntime.divePhase = 'NONE'; gowRuntime.turnPhase = 'PLAYER_TURN';
      Object.assign(gowRuntime, { shockwaveTimer: 0.58, shockwaveColor: style === 'flank' ? '#5ee6d0' : '#ffcf5c', shockwaveX: runtime.position.x, shockwaveY: 20.15, shockwaveZ: runtime.position.z });
      if (style === 'meteor') {
        useGame.setState({ flying: false, landing: false }); gowRuntime.ap = 2;
        for (const e of gowRuntime.enemies) if (e.state !== 'dead') applyHitToEnemy(e, 45, 50, reduced, 'METEOR BREACH');
        setVec(runtime.position, 0, 20 + FOOT, 64.0); setVec(presentation.position, 0, 20 + FOOT, 64.0);
      } else if (style === 'flank') {
        useGame.setState({ flying: true, landing: false }); gowRuntime.ap = 3; gowRuntime.guardWard = true;
        pushPopup('⚡ FLANK GLIDE • 3 AP + COUNTER WARD!', 'parry', runtime.position.x, runtime.position.y + 1.2, runtime.position.z);
      } else {
        useGame.setState({ flying: false, landing: false }); gowRuntime.ap = 2; gowRuntime.rage = 100; gowRuntime.rageActive = 8.0; playRageAudio();
        for (const e of gowRuntime.enemies) if (e.state !== 'dead') applyHitToEnemy(e, 30, 30, reduced, 'SOLAR HALO');
      }
      if (!reduced) addTrauma(runtime.shooter.camFx, 0.45);
      spawnHitSparks(runtime.position.x, 20.5, runtime.position.z, '#ffd166', 10); playImpactAudio(true);
    }
  }
}

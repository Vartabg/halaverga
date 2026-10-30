'use client';

import { useEffect, useState } from 'react';
import { selectTarget } from '@/game/gowCombat';
import { executeModeCommand, switchDemoMode } from '@/game/gowPrototypeLab';
import { gowRuntime, type DemoMode, type DivePhase, type EnemyId, type TurnPhase } from '@/game/gowTypes';
import { useGame } from '@/game/store';
import styles from './GowHud.module.css';

interface EnemySnap {
  id: EnemyId; name: string; hp: number; maxHp: number; stun: number;
  dead: boolean; stunned: boolean; intentLabel: string; portrait: string;
}

interface HudSnapshot {
  hp: number; rage: number; rageActive: boolean;
  demoMode: DemoMode; ecoMode: boolean; divePhase: DivePhase;
  cutInTimer: number; cutInTitle: string; cutInSub: string; cutInPortrait: string;
  oathCount: number; sigilPrism: boolean;
  turnPhase: TurnPhase; turnNumber: number; ap: number; maxAp: number; guardWard: boolean;
  lockedId: EnemyId | null; bossHp: number; bossMaxHp: number; bossStun: number;
  moveLabel: string; popupText: string; threatPrompt: string; enemies: EnemySnap[];
}

function readSnapshot(): HudSnapshot {
  const boss = gowRuntime.enemies.find((e) => e.isBoss);
  const latestPopup = gowRuntime.popups[gowRuntime.popups.length - 1];
  return {
    hp: Math.round(gowRuntime.hp), rage: Math.round(gowRuntime.rage), rageActive: gowRuntime.rageActive > 0,
    demoMode: gowRuntime.demoMode, ecoMode: gowRuntime.ecoMode, divePhase: gowRuntime.divePhase,
    cutInTimer: gowRuntime.cutInTimer, cutInTitle: gowRuntime.cutInTitle, cutInSub: gowRuntime.cutInSub, cutInPortrait: gowRuntime.cutInPortrait,
    oathCount: gowRuntime.oathTethers.filter(Boolean).length, sigilPrism: gowRuntime.sigilPrism,
    turnPhase: gowRuntime.turnPhase, turnNumber: gowRuntime.turnNumber, ap: gowRuntime.ap, maxAp: gowRuntime.maxAp,
    guardWard: gowRuntime.guardWard, lockedId: gowRuntime.lockedTargetId,
    bossHp: Math.round(boss?.hp ?? 0), bossMaxHp: boss?.maxHp ?? 520, bossStun: Math.round(boss?.stun ?? 0),
    moveLabel: gowRuntime.comboBannerTimer > 0 ? gowRuntime.lastMoveLabel : '',
    popupText: latestPopup ? latestPopup.text : '', threatPrompt: gowRuntime.threatPrompt,
    enemies: gowRuntime.enemies.map((e, idx) => ({
      id: e.id, name: e.isBoss ? 'Semjaza (Boss)' : e.name.replace(' Vanguard', ''),
      hp: Math.round(e.hp), maxHp: e.maxHp, stun: Math.round(e.stun), dead: e.state === 'dead', stunned: e.state === 'stunned',
      intentLabel: e.state === 'stunned' ? '⚡ STUNNED · SKIPS TURN' : gowRuntime.demoMode === 'sigil' && idx < 2 && gowRuntime.oathTethers[idx] ? `🔗 OATH TETHERED • ${e.intentLabel}` : e.intentLabel,
      portrait: e.portrait,
    })),
  };
}

function getDeckSpec(snap: HudSnapshot, flying: boolean) {
  if (snap.demoMode === 'dive' && snap.divePhase === 'BREACH_AIM') {
    return [
      { title: '☄️ Meteor Breach', meta: '0 AP • 45 AoE DMG + Stun', disabled: false },
      { title: '⚡ Winged Flank', meta: '0 AP • Sky Stance + 3 AP', disabled: false },
      { title: '☀️ Solar Halo Drop', meta: '0 AP • 100% Rage + Burn', disabled: false },
      { title: '🎯 Dive Semjaza', meta: '0 AP • Direct Altar Crash', disabled: false },
      { title: '⏭️ Skip Breach', meta: 'Watchers Act', disabled: false },
    ];
  }
  const noAp = snap.turnPhase !== 'PLAYER_TURN' || snap.ap < 1;
  if (snap.demoMode === 'sigil') {
    return [
      { title: snap.oathCount > 0 ? '✂️ Sever Oath' : '⚔️ Dawn Cleave', meta: snap.oathCount > 0 ? `1 AP • Break Tether (${snap.oathCount} Left)` : '1 AP • 34 DMG Lunge', disabled: noAp },
      { title: '⭐ Star-Fall Vector', meta: '1 AP • 58 DMG Orbital Beam', disabled: noAp },
      { title: '🔺 Enochian Prism', meta: '1 AP • Reflect 100% (45 DMG)', disabled: noAp },
      { title: '☀️ Dawn Judgement', meta: '1 AP • 35 Rage AoE', disabled: noAp || (snap.rage < 35 && !snap.rageActive) },
      { title: '⏭️ End Turn', meta: 'Watchers Act', disabled: snap.turnPhase !== 'PLAYER_TURN' },
    ];
  }
  return [
    { title: flying ? '🦅 Swoop Strike' : '💥 Vector Ram', meta: flying ? '1 AP • 56 DMG + Land' : '1 AP • 44 DMG Knockback', disabled: noAp },
    { title: flying ? '✨ Sword Beam' : '🛡️ Counter Ward', meta: flying ? '1 AP • 38 DMG From Sky' : '1 AP • Riposte 42 DMG', disabled: noAp },
    { title: flying ? '🕊️ Feather Descent' : '🪽 Take Wing', meta: flying ? '0 AP • Land + Ward' : '1 AP • Evade Quakes', disabled: snap.turnPhase !== 'PLAYER_TURN' || (!flying && snap.ap < 1) },
    { title: '☀️ Dawn Judgement', meta: '1 AP • 35 Rage AoE', disabled: noAp || (snap.rage < 35 && !snap.rageActive) },
    { title: snap.demoMode === 'dive' ? '🦅 Re-Ascend Dive' : '⏭️ End Turn', meta: snap.demoMode === 'dive' ? 'Return to Overlook' : 'Watchers Act', disabled: snap.turnPhase !== 'PLAYER_TURN' },
  ];
}

export default function GowHud() {
  const { started, paused, shooter, panel, journal, controlsOpen, voteOpen, flying, reduced, tapControls, controlLab, touchScheme } = useGame();
  const [snap, setSnap] = useState<HudSnapshot>(readSnapshot);

  useEffect(() => {
    if (!started || paused || !shooter) return;
    const id = window.setInterval(() => setSnap(readSnapshot()), 65);
    return () => window.clearInterval(id);
  }, [started, paused, shooter]);

  if (!started || paused || !shooter || panel || journal || controlsOpen || voteOpen) return null;

  const showDeck = !tapControls && controlLab === 'standard' && touchScheme !== 'twin';
  const bossPct = Math.max(0, Math.min(100, (snap.bossHp / snap.bossMaxHp) * 100));
  const phaseBanner = snap.divePhase === 'BREACH_AIM'
    ? 'SUMMIT OVERLOOK • CHOOSE BREACH TRAJECTORY'
    : snap.turnPhase === 'ENEMY_TURN'
      ? `ROUND ${snap.turnNumber} • WATCHERS' TURN`
      : flying
        ? `ROUND ${snap.turnNumber} • SKY STANCE (${snap.ap}/${snap.maxAp} AP)`
        : `ROUND ${snap.turnNumber} • URIEL'S TURN (${snap.ap}/${snap.maxAp} AP)`;
  const deck = getDeckSpec(snap, flying);

  return (
    <div className={styles.hud} data-gow-hud="" data-testid="gow-hud" aria-hidden={showDeck ? undefined : 'true'}>
      {snap.cutInTimer > 0 ? (
        <div className={styles.cutInBanner} data-testid="gow-cutin-banner" aria-hidden="true">
          <img src={snap.cutInPortrait} alt="" className={styles.cutInPortrait} width={52} height={52} />
          <div className={styles.cutInCopy}>
            <span className={styles.cutInTitle}>{snap.cutInTitle}</span>
            <span className={styles.cutInSub}>{snap.cutInSub}</span>
          </div>
        </div>
      ) : null}

      <div className={styles.bossPlate} data-testid="gow-boss-plate">
        {showDeck ? (
          <div className={styles.labBar} data-testid="gow-demo-switcher">
            {([['clash', '💥 1 · Diorama Clash'], ['sigil', '📐 2 · Sigil Weaver'], ['dive', '🦅 3 · Dive-to-Duel']] as const).map(([mode, label]) => (
              <button
                key={mode} type="button" aria-pressed={snap.demoMode === mode}
                onMouseDown={(ev) => ev.preventDefault()} onClick={() => { switchDemoMode(mode); setSnap(readSnapshot()); }}
                className={`${styles.labBtn} ${snap.demoMode === mode ? styles.labBtnActive : ''}`}
              >
                {label}
              </button>
            ))}
            <span className={styles.powerBadge} data-testid="gow-power-badge">{snap.ecoMode ? '⚡ ECO 12FPS' : '🔥 BURST 60FPS'}</span>
          </div>
        ) : null}

        <div className={styles.bossHeader}>
          <span className={styles.bossTitle}>{phaseBanner}</span>
          <span className={styles.bossNumbers}>SEMJAZA HP {snap.bossHp}/{snap.bossMaxHp} {snap.demoMode === 'sigil' && snap.oathCount > 0 ? `• 🛡️ AEGIS (${snap.oathCount})` : `• STUN ${snap.bossStun}%`}</span>
        </div>
        <div className={styles.barTrack}><div className={styles.hpFill} style={{ width: `${bossPct}%` }} /></div>

        {showDeck ? (
          <>
            <div className={styles.targetStrip} data-testid="gow-target-strip">
              {snap.enemies.map((e) => (
                <button
                  key={e.id} type="button" disabled={e.dead}
                  onMouseDown={(ev) => ev.preventDefault()} onClick={() => { selectTarget(e.id); setSnap(readSnapshot()); }}
                  className={`${styles.targetCard} ${snap.lockedId === e.id ? styles.targetLocked : ''}`}
                >
                  <img src={e.portrait} alt="" className={styles.targetPortrait} width={28} height={28} />
                  <span className={styles.targetInfo}>
                    <span className={styles.targetName}>{snap.lockedId === e.id ? `◎ ${e.name}` : e.name} ({e.hp} HP)</span>
                    <span className={styles.targetIntent}>{e.intentLabel}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className={styles.commandRow} data-testid="gow-command-deck">
              {deck.map((item, idx) => (
                <button
                  key={item.title} type="button" disabled={item.disabled}
                  onMouseDown={(ev) => ev.preventDefault()} onClick={() => { executeModeCommand((idx + 1) as 1 | 2 | 3 | 4 | 5, reduced); setSnap(readSnapshot()); }}
                  className={idx === 4 ? styles.endTurnBtn : styles.cmdBtn}
                >
                  <span className={styles.cmdTitle}>{item.title}</span>
                  <span className={styles.cmdMeta}>{item.meta}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className={styles.playerPlate} data-testid="gow-player-plate">
        <div className={styles.heroHeader}>
          <img src="/sprites/uriel-portrait.jpg" alt="" className={styles.portrait} width={44} height={44} />
          <div className={styles.heroBars}>
            <div className={styles.statRow}><span>URIEL VITALITY {snap.sigilPrism ? '• 🔺 PRISM' : snap.guardWard ? '• 🛡️ WARD' : ''}</span><span>{snap.hp}%</span></div>
            <div className={styles.barTrack}><div className={styles.heroHpFill} style={{ width: `${snap.hp}%` }} /></div>
            <div className={styles.statRow}><span className={styles.statAccent}>{flying ? 'SKY STANCE • ON WING' : 'WINGED RAGE'}</span><span className={styles.statAccent}>{snap.rage}%</span></div>
            <div className={styles.stunTrack}><div className={styles.rageFill} style={{ width: `${snap.rage}%` }} /></div>
          </div>
        </div>
        {(snap.moveLabel || snap.popupText || snap.threatPrompt) ? (
          <div className={styles.comboBadge} data-testid="gow-combo-badge">{snap.popupText || snap.moveLabel || snap.threatPrompt}</div>
        ) : null}
      </div>
    </div>
  );
}

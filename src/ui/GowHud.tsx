'use client';

import { useEffect, useState } from 'react';
import { executeTurnCommand, selectTarget } from '@/game/gowCombat';
import { gowRuntime, type EnemyId, type TurnPhase } from '@/game/gowTypes';
import { useGame } from '@/game/store';
import styles from './GowHud.module.css';

interface EnemySnap {
  id: EnemyId; name: string; hp: number; maxHp: number; stun: number;
  dead: boolean; stunned: boolean; intentLabel: string; portrait: string;
}

interface HudSnapshot {
  hp: number; rage: number; rageActive: boolean; turnPhase: TurnPhase;
  turnNumber: number; ap: number; maxAp: number; guardWard: boolean;
  lockedId: EnemyId | null; bossHp: number; bossMaxHp: number; bossStun: number;
  moveLabel: string; popupText: string; threatPrompt: string; enemies: EnemySnap[];
}

function readSnapshot(): HudSnapshot {
  const boss = gowRuntime.enemies.find((e) => e.isBoss);
  const latestPopup = gowRuntime.popups[gowRuntime.popups.length - 1];
  return {
    hp: Math.round(gowRuntime.hp), rage: Math.round(gowRuntime.rage), rageActive: gowRuntime.rageActive > 0,
    turnPhase: gowRuntime.turnPhase, turnNumber: gowRuntime.turnNumber, ap: gowRuntime.ap, maxAp: gowRuntime.maxAp,
    guardWard: gowRuntime.guardWard, lockedId: gowRuntime.lockedTargetId,
    bossHp: Math.round(boss?.hp ?? 0), bossMaxHp: boss?.maxHp ?? 520, bossStun: Math.round(boss?.stun ?? 0),
    moveLabel: gowRuntime.comboBannerTimer > 0 ? gowRuntime.lastMoveLabel : '',
    popupText: latestPopup ? latestPopup.text : '', threatPrompt: gowRuntime.threatPrompt,
    enemies: gowRuntime.enemies.map((e) => ({
      id: e.id, name: e.isBoss ? 'Semjaza (Boss)' : e.name.replace(' Vanguard', ''),
      hp: Math.round(e.hp), maxHp: e.maxHp, stun: Math.round(e.stun),
      dead: e.state === 'dead', stunned: e.state === 'stunned',
      intentLabel: e.state === 'stunned' ? '⚡ STUNNED · SKIPS TURN' : e.intentLabel, portrait: e.portrait,
    })),
  };
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
  const canCommand = snap.turnPhase === 'PLAYER_TURN';
  const bossPct = Math.max(0, Math.min(100, (snap.bossHp / snap.bossMaxHp) * 100));
  const phaseBanner = snap.turnPhase === 'ENEMY_TURN'
    ? `ROUND ${snap.turnNumber} • WATCHERS' TURN`
    : flying
      ? `ROUND ${snap.turnNumber} • SKY STANCE (${snap.ap}/${snap.maxAp} AP)`
      : `ROUND ${snap.turnNumber} • URIEL'S TURN (${snap.ap}/${snap.maxAp} AP)`;

  return (
    <div className={styles.hud} data-gow-hud="" data-testid="gow-hud" aria-hidden={showDeck ? undefined : 'true'}>
      <div className={styles.bossPlate} data-testid="gow-boss-plate">
        <div className={styles.bossHeader}>
          <span className={styles.bossTitle}>{phaseBanner}</span>
          <span className={styles.bossNumbers}>SEMJAZA HP {snap.bossHp}/{snap.bossMaxHp} • STUN {snap.bossStun}%</span>
        </div>
        <div className={styles.barTrack}>
          <div className={styles.hpFill} style={{ width: `${bossPct}%` }} />
        </div>

        {showDeck ? (
          <>
            <div className={styles.targetStrip} data-testid="gow-target-strip">
              {snap.enemies.map((e) => (
                <button
                  key={e.id} type="button" disabled={e.dead}
                  onMouseDown={(ev) => ev.preventDefault()} onClick={() => selectTarget(e.id)}
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
              <button
                type="button" disabled={!canCommand || snap.ap < 1}
                onMouseDown={(ev) => ev.preventDefault()} onClick={() => executeTurnCommand(flying ? 'swoop' : 'slash', reduced)}
                className={styles.cmdBtn}
              >
                <span className={styles.cmdTitle}>{flying ? '🦅 Swoop Strike' : '⚔️ Dawn Cleave'}</span>
                <span className={styles.cmdMeta}>{flying ? '1 AP • 56 DMG + Land' : '1 AP • 34 DMG Lunge'}</span>
              </button>
              <button
                type="button" disabled={!canCommand || snap.ap < 1}
                onMouseDown={(ev) => ev.preventDefault()} onClick={() => executeTurnCommand(flying ? 'beam' : 'ward', reduced)}
                className={styles.cmdBtn}
              >
                <span className={styles.cmdTitle}>{flying ? '✨ Sword Beam' : '🛡️ Counter Ward'}</span>
                <span className={styles.cmdMeta}>{flying ? '1 AP • 38 DMG From Sky' : '1 AP • Riposte 42 DMG'}</span>
              </button>
              <button
                type="button" disabled={!canCommand || (!flying && snap.ap < 1)}
                onMouseDown={(ev) => ev.preventDefault()} onClick={() => executeTurnCommand('wing', reduced)}
                className={`${styles.cmdBtn} ${flying ? styles.cmdActive : ''}`}
              >
                <span className={styles.cmdTitle}>{flying ? '🕊️ Feather Descent' : '🪽 Take Wing'}</span>
                <span className={styles.cmdMeta}>{flying ? '0 AP • Land + Ward' : '1 AP • Evade Quakes'}</span>
              </button>
              <button
                type="button" disabled={!canCommand || snap.ap < 1 || (snap.rage < 35 && !snap.rageActive)}
                onMouseDown={(ev) => ev.preventDefault()} onClick={() => executeTurnCommand('rage', reduced)}
                className={styles.cmdBtn}
              >
                <span className={styles.cmdTitle}>☀️ Dawn Judgement</span>
                <span className={styles.cmdMeta}>1 AP • 35 Rage AoE</span>
              </button>
              <button
                type="button" disabled={!canCommand}
                onMouseDown={(ev) => ev.preventDefault()} onClick={() => executeTurnCommand('end', reduced)}
                className={styles.endTurnBtn}
              >
                <span className={styles.cmdTitle}>⏭️ End Turn</span>
                <span className={styles.cmdMeta}>Watchers Act</span>
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className={styles.playerPlate} data-testid="gow-player-plate">
        <div className={styles.heroHeader}>
          <img src="/sprites/uriel-portrait.jpg" alt="" className={styles.portrait} width={44} height={44} />
          <div className={styles.heroBars}>
            <div className={styles.statRow}>
              <span>URIEL VITALITY {snap.guardWard ? '• 🛡️ WARD' : ''}</span>
              <span>{snap.hp}%</span>
            </div>
            <div className={styles.barTrack}><div className={styles.heroHpFill} style={{ width: `${snap.hp}%` }} /></div>
            <div className={styles.statRow}>
              <span className={styles.statAccent}>{flying ? 'SKY STANCE • ON WING' : 'WINGED RAGE'}</span>
              <span className={styles.statAccent}>{snap.rage}%</span>
            </div>
            <div className={styles.stunTrack}><div className={styles.rageFill} style={{ width: `${snap.rage}%` }} /></div>
          </div>
        </div>
        {(snap.moveLabel || snap.popupText || snap.threatPrompt) ? (
          <div className={styles.comboBadge} data-testid="gow-combo-badge">
            {snap.popupText || snap.moveLabel || snap.threatPrompt}
          </div>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { gowRuntime } from '@/game/gowTypes';
import { useGame } from '@/game/store';
import styles from './GowHud.module.css';

interface HudSnapshot {
  hp: number;
  rage: number;
  rageActive: boolean;
  bossHp: number;
  bossMaxHp: number;
  bossStun: number;
  bossStaggered: boolean;
  vanguardsAlive: number;
  runicCd: number;
  comboHits: number;
  comboTimerPct: number;
  moveLabel: string;
  popupText: string;
  popupTone: string;
  threatPrompt: string;
  realmShift: boolean;
}

function readSnapshot(): HudSnapshot {
  const boss = gowRuntime.enemies.find((e) => e.isBoss);
  const vanguardsAlive = gowRuntime.enemies.filter(
    (e) => !e.isBoss && e.state !== 'dead',
  ).length;
  const latestPopup = gowRuntime.popups[gowRuntime.popups.length - 1];
  return {
    hp: Math.round(gowRuntime.hp),
    rage: Math.round(gowRuntime.rage),
    rageActive: gowRuntime.rageActive > 0,
    bossHp: Math.round(boss?.hp ?? 0),
    bossMaxHp: boss?.maxHp ?? 450,
    bossStun: Math.round(boss?.stun ?? 0),
    bossStaggered: boss?.state === 'stagger',
    vanguardsAlive,
    runicCd: Math.ceil(gowRuntime.runicCooldown),
    comboHits: gowRuntime.comboBannerTimer > 0 ? gowRuntime.comboHits : 0,
    comboTimerPct:
      gowRuntime.comboBannerTimer > 0
        ? Math.round(Math.min(100, (gowRuntime.comboBannerTimer / 2.6) * 100))
        : 0,
    moveLabel: gowRuntime.comboBannerTimer > 0 ? gowRuntime.lastMoveLabel : '',
    popupText: latestPopup ? latestPopup.text : '',
    popupTone: latestPopup ? latestPopup.tone : '',
    threatPrompt: gowRuntime.threatPrompt,
    realmShift: gowRuntime.realmShiftTimer > 0,
  };
}

export default function GowHud() {
  const started = useGame((s) => s.started);
  const paused = useGame((s) => s.paused);
  const shooter = useGame((s) => s.shooter);
  const panel = useGame((s) => s.panel);
  const journal = useGame((s) => s.journal);
  const controlsOpen = useGame((s) => s.controlsOpen);
  const voteOpen = useGame((s) => s.voteOpen);

  const [snap, setSnap] = useState<HudSnapshot>(readSnapshot);

  useEffect(() => {
    if (!started || paused || !shooter) return;
    const id = window.setInterval(() => {
      const next = readSnapshot();
      setSnap((prev) =>
        prev.hp === next.hp &&
        prev.rage === next.rage &&
        prev.rageActive === next.rageActive &&
        prev.bossHp === next.bossHp &&
        prev.bossStun === next.bossStun &&
        prev.bossStaggered === next.bossStaggered &&
        prev.vanguardsAlive === next.vanguardsAlive &&
        prev.runicCd === next.runicCd &&
        prev.comboHits === next.comboHits &&
        prev.comboTimerPct === next.comboTimerPct &&
        prev.moveLabel === next.moveLabel &&
        prev.popupText === next.popupText &&
        prev.popupTone === next.popupTone &&
        prev.threatPrompt === next.threatPrompt &&
        prev.realmShift === next.realmShift
          ? prev
          : next,
      );
    }, 65);
    return () => window.clearInterval(id);
  }, [started, paused, shooter]);

  if (!started || paused || !shooter || panel || journal || controlsOpen || voteOpen) {
    return null;
  }

  const bossPct = Math.max(0, Math.min(100, (snap.bossHp / snap.bossMaxHp) * 100));

  return (
    <div className={styles.hud} data-gow-hud="" data-testid="gow-hud" aria-hidden="true">
      <div className={styles.bossPlate} data-testid="gow-boss-plate">
        <div className={styles.bossHeader}>
          <span className={styles.bossTitle}>
            Semjaza • Watcher Chief
          </span>
          <span className={styles.bossNumbers}>
            HP {snap.bossHp}/{snap.bossMaxHp} • STUN {snap.bossStun}%
          </span>
        </div>
        <div className={styles.barTrack}>
          <div className={styles.hpFill} style={{ width: `${bossPct}%` }} />
        </div>
        <div className={styles.stunTrack}>
          <div className={styles.stunFill} style={{ width: `${snap.bossStun}%` }} />
        </div>
        {snap.threatPrompt ? (
          <div className={styles.threatBanner} data-testid="gow-threat-banner">
            {snap.threatPrompt}
          </div>
        ) : null}
      </div>

      <div className={styles.playerPlate} data-testid="gow-player-plate">
        <div className={styles.statRow}>
          <span>ARCHANGEL VITALITY</span>
          <span>{snap.hp}%</span>
        </div>
        <div className={styles.barTrack}>
          <div className={styles.heroHpFill} style={{ width: `${snap.hp}%` }} />
        </div>

        <div className={styles.statRow}>
          <span className={styles.statAccent}>
            {snap.rageActive ? 'WINGED RAGE ACTIVE' : 'WINGED RAGE [V]'}
          </span>
          <span className={styles.statAccent}>{snap.rage}%</span>
        </div>
        <div className={styles.stunTrack}>
          <div className={styles.rageFill} style={{ width: `${snap.rage}%` }} />
        </div>

        <div className={styles.cooldownRow}>
          <span>
            URIEL FLAME [G]: {snap.runicCd > 0 ? `${snap.runicCd}s` : 'READY'}
          </span>
          <span>WATCHERS: {snap.vanguardsAlive + (snap.bossHp > 0 ? 1 : 0)}</span>
        </div>

        {snap.comboHits > 0 || snap.realmShift || snap.popupText ? (
          <div className={styles.comboBadge} data-testid="gow-combo-badge">
            <div>
              {snap.realmShift
                ? 'CELESTIAL REALM SHIFT'
                : snap.comboHits > 0
                  ? `x${snap.comboHits} FREEFLOW • ${snap.moveLabel || 'STRIKE'}`
                  : snap.popupText}
            </div>
            {snap.comboTimerPct > 0 ? (
              <div className={styles.comboTimerTrack}>
                <div
                  className={styles.comboTimerFill}
                  style={{ width: `${snap.comboTimerPct}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={styles.combatKeys}>
          [J/Click] Strike/Swoop • [K] Slam/Beam • [Q/R-Click] Counter/Beam • [Space] Elevate • [C/Shift] Roll • [G] Runic • [V] Rage
        </div>
      </div>
    </div>
  );
}

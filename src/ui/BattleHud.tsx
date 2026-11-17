'use client';
import { useEffect, useState } from 'react';
import { battle, BATTLE, resetBattle } from '@/game/celestialBattle';
import { runtime } from '@/game/runtime';
import { banish, REBUKE_LINE, type Cue } from '@/game/banishState';
import { useGame } from '@/game/store';
import { counterState } from '@/game/counterState';
import { pause, resume } from './useInput';
import Modal from './Modal';
import CombatTarget from './CombatTarget';
import EliteHud from './EliteHud';
import { COMMAND, requestCommand } from '@/game/commands';
import { unlockBlasterAudio } from './audioUnlock';
import styles from './BattleHud.module.css';

const CUES: Record<Cue, string> = { '': '', far: 'Too far · fly closer', notDown: 'Strike it down before you bind it', notBound: 'This demon is already being cast down', noTarget: '', guarded: 'Warden guarded · defend, then strike the opening' };
const sample = () => ({ ward: battle.ward, kills: battle.banished, status: battle.status, hurt: battle.hurt > 0, charging: battle.charging >= 0,
  combo: banish.combo, rebuke: banish.clock - banish.rebukeT < REBUKE_LINE, fx: banish.fxSerial, modes: banish.mode.join(''), counter: counterState.attacker >= 0, slow: Math.min(1, Math.round((1 - counterState.scale) * 6.25) / 5), counters: counterState.serial, cue: (banish.clock - banish.cueT < 1.4 ? banish.cue : '') as Cue });
export default function BattleHud() {
  const [readout, setReadout] = useState(sample), paused = useGame(s => s.paused);
  useEffect(() => {
    const tick = () => { const s = sample(); setReadout(old => Object.keys(s).every(k => s[k as keyof typeof s] === old[k as keyof typeof s]) ? old : s);
      if (s.status === 'fallen' && !useGame.getState().paused) pause(); };
    const id = setInterval(tick, 100); return () => clearInterval(id);
  }, []);
  const retry = () => { resetBattle(runtime.shooter.stats.kills); banish.resetRequested = true; runtime.reset = true; setReadout(sample()); resume(); };
  if (readout.status === 'fallen') return <Modal title="Your ward is broken" onClose={retry}>
    <p>The host has driven you back. Return to the Threshold of Hermon, take wing, and try again.</p>
    <button className={styles.retry} onClick={retry}>Return to the threshold</button>
  </Modal>;
  if (paused) return null;
  return <>
    <CombatTarget /><EliteHud />
    {readout.status === 'battle' && <button className={styles.attack} aria-label="Strike next demon" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); unlockBlasterAudio(); requestCommand(runtime.shooter, COMMAND.context); }}>{readout.combo > 0 ? 'Chain' : 'Strike'}</button>}
    <aside className={styles.mission} data-testid="battle-hud" data-combo={readout.combo} data-ward={readout.ward} data-banished={readout.kills} data-status={readout.status} data-banish-fx={readout.fx} data-modes={readout.modes} data-armor={banish.armor.join('')} data-counters={readout.counters} aria-label="Battle objective">
      {/* Only the count and the ward (Garo, 2026-11-17: the screen was flooded with text); the title shows once the host is cast down. */}
      {readout.status === 'victory' && <strong>The host is cast down</strong>}
      <span className={styles.count}>{Math.min(BATTLE.goal, readout.kills)} / {BATTLE.goal}</span>
      <div className={styles.ward} role="img" aria-label={`Protective ward: ${readout.ward} of ${BATTLE.ward}`}>
        {[0, 1, 2].map(i => <i key={i} data-lit={readout.ward > i} />)}
      </div>
    </aside>
    {readout.slow > 0 && <div className={styles.slow} style={{ opacity: readout.slow }} aria-hidden="true" />}
    {readout.counter && <p className={styles.counter} role="status" data-testid="counter-prompt"><span className={styles.coarse}>Tap · counter!</span><span className={styles.fine}>Click · counter!</span></p>}
    {readout.charging && !readout.counter && <p className={styles.warning} role="status">Fiery dart · raise the shield or keep moving</p>}
    {readout.rebuke && <p className={styles.rebuke} role="status">“May the Lord rebuke you!” <cite>Jude 9</cite></p>}
    {CUES[readout.cue] && <p className={styles.cue} role="status">{CUES[readout.cue]}</p>}
    {readout.hurt && <div className={styles.hurt} aria-hidden="true" />}
    <div className="sr-only" aria-live="polite">{readout.status === 'victory' ? 'Victory. The host is cast down.' : `Protective ward ${readout.ward} of three. ${readout.kills} demons cast down.`}</div>
  </>;
}

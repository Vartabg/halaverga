'use client';
import { useEffect, useState } from 'react';
import { battle, BATTLE, resetBattle } from '@/game/celestialBattle';
import { runtime } from '@/game/runtime';
import { banish, MODE, REBUKE_LINE, type Cue } from '@/game/banishState';
import { useGame } from '@/game/store';
import { pause, resume } from './useInput';
import Modal from './Modal';
import CombatTarget from './CombatTarget';
import EliteHud from './EliteHud';
import { COMMAND, requestCommand } from '@/game/commands';
import { unlockBlasterAudio } from './audioUnlock';
import styles from './BattleHud.module.css';

const CUES: Record<Cue, string> = { '': '', far: 'Too far · fly closer', notDown: 'Strike it down before you bind it', notBound: 'This demon is already being banished', noTarget: '', guarded: 'Warden resisting · evade, shield or chain away' };
/** The next move for the demon last engaged, by its state: touch wording, then keyboard/mouse wording. */
const NEXT: Record<number, [string, string]> = {
  [-1]: ['Tap a demon · strike through it', 'Face the host · click to strike'],
  [MODE.free]: ['Tap a demon · strike through it', 'Face the host · click to strike'],
  [MODE.staggered]: ['Tap the next demon · chain!', 'Click again · chain!'],
  [MODE.down]: ['Circle it · bind it in chains', 'Click · bind it in chains'],
  [MODE.bound]: ['Tap the next demon · keep moving', 'Click again · chain to the next demon'],
  [MODE.cast]: ['Tap the next demon · keep moving', 'Click again · chain to the next demon'],
};
const nextStep = () => { const i = banish.last; return i >= 0 && runtime.shooter.targets[i]?.alive ? banish.mode[i] : -1; };
const sample = () => ({ ward: battle.ward, kills: battle.banished, status: battle.status, hurt: battle.hurt > 0, charging: battle.charging >= 0,
  combo: banish.combo, next: nextStep(), rebuke: banish.clock - banish.rebukeT < REBUKE_LINE, fx: banish.fxSerial, modes: banish.mode.join(''), cue: (banish.clock - banish.cueT < 1.4 ? banish.cue : '') as Cue });
export default function BattleHud() {
  const [readout, setReadout] = useState(sample), paused = useGame(s => s.paused);
  useEffect(() => {
    const tick = () => { const s = sample(); setReadout(old => Object.keys(s).every(k => s[k as keyof typeof s] === old[k as keyof typeof s]) ? old : s);
      if (s.status === 'fallen' && !useGame.getState().paused) pause(); };
    const id = setInterval(tick, 100); return () => clearInterval(id);
  }, []);
  const retry = () => { resetBattle(runtime.shooter.stats.kills); banish.resetRequested = true; runtime.reset = true; setReadout(sample()); resume(); };
  if (readout.status === 'fallen') return <Modal title="Your ward is broken" onClose={retry}>
    <p>The host has driven you back. Your sanctuary remains. Regroup, take wing, and try again.</p>
    <button className={styles.retry} onClick={retry}>Regroup at the sanctuary</button>
  </Modal>;
  if (paused) return null;
  return <>
    <CombatTarget /><EliteHud />
    {readout.status === 'battle' && <button className={styles.attack} aria-label="Strike next demon" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); unlockBlasterAudio(); requestCommand(runtime.shooter, COMMAND.context); }}>{readout.combo > 0 ? 'Chain' : 'Strike'}</button>}
    <aside className={styles.mission} data-testid="battle-hud" data-combo={readout.combo} data-ward={readout.ward} data-banished={readout.kills} data-status={readout.status} data-banish-fx={readout.fx} data-modes={readout.modes} data-armor={banish.armor.join('')} aria-label="Battle objective">
      <span className={styles.chapter}>{readout.combo > 1 ? `${readout.combo} STRIKE CHAIN` : 'I / THE BREACH'}</span>
      <strong>{readout.status === 'victory' ? 'The gate is secured' : 'Banish the abyssal host'}</strong>
      <span>{readout.status === 'victory' ? 'Victory · continue your flight' : `${Math.min(BATTLE.goal, readout.kills)} / ${BATTLE.goal} banished${readout.combo > 1 ? ` · ${readout.combo} hit chain` : ''}`}</span>
      <div className={styles.ward} aria-label={`Protective ward: ${readout.ward} of ${BATTLE.ward}`}>
        {[0, 1, 2].map(i => <i key={i} data-lit={readout.ward > i} />)}<span>WARD</span>
      </div>
    </aside>
    {readout.charging && <p className={styles.warning} role="status">Fiery dart · raise the shield or keep moving</p>}
    {readout.rebuke && <p className={styles.rebuke} role="status">“May the Lord rebuke you!” <cite>Jude 9</cite></p>}
    {CUES[readout.cue] && <p className={styles.cue} role="status">{CUES[readout.cue]}</p>}
    {readout.status === 'battle' && readout.combo === 0 && readout.kills === 0 && readout.fx === 0 && NEXT[readout.next]?.[0] && <p className={styles.next} role="status" data-testid="next-move">
      <span className={styles.coarse}>{NEXT[readout.next][0]}</span><span className={styles.fine}>{NEXT[readout.next][1]}</span></p>}
    {readout.status === 'battle' && readout.fx === 0 && <p className={styles.legend} aria-label="Combat strokes">
      <span className={styles.coarse}>Tap a demon: strike · Chain: next demon · hold a 2nd finger: shield</span>
      <span className={styles.fine}>Click or C: strike / chain · 1: rebuke · hold V: shield</span></p>}
    {readout.hurt && <div className={styles.hurt} aria-hidden="true" />}
    <div className="sr-only" aria-live="polite">{readout.status === 'victory' ? 'Victory. The gate is secured.' : `Protective ward ${readout.ward} of three. ${readout.kills} enemies banished.`}</div>
  </>;
}

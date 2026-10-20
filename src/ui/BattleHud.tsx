'use client';
import { useEffect, useState } from 'react';
import { battle, BATTLE, resetBattle } from '@/game/celestialBattle';
import { runtime } from '@/game/runtime';
import { banish, MODE, REBUKE_LINE, type Cue } from '@/game/banishState';
import { useGame } from '@/game/store';
import { pause, resume } from './useInput';
import Modal from './Modal';
import styles from './BattleHud.module.css';

const CUES: Record<Cue, string> = { '': '', far: 'Too far · fly closer', notDown: 'Strike it down before you bind it', notBound: 'Circle it to bind it first', noTarget: '' };
/** The next move for the demon last engaged, by its state: touch wording, then keyboard/mouse wording. */
const NEXT: Record<number, [string, string]> = {
  [-1]: ['Tap a demon to rebuke it', 'Aim at a demon · click to rebuke'],
  [MODE.free]: ['Tap a demon to rebuke it', 'Aim at a demon · click to rebuke'],
  [MODE.staggered]: ['Swipe through it · strike!', 'Click again · strike!'],
  [MODE.down]: ['Circle it · bind it in chains', 'Click · bind it in chains'],
  [MODE.bound]: ['Flick down · cast it into the abyss', 'Click · cast it into the abyss'],
  [MODE.cast]: ['', ''],
};
const nextStep = () => { const i = banish.last; return i >= 0 && runtime.shooter.targets[i]?.alive ? banish.mode[i] : -1; };
const sample = () => ({ ward: battle.ward, kills: battle.banished, status: battle.status, hurt: battle.hurt > 0, charging: battle.charging >= 0,
  next: nextStep(), rebuke: banish.clock - banish.rebukeT < REBUKE_LINE, fx: banish.fxSerial, modes: banish.mode.join(''), cue: (banish.clock - banish.cueT < 1.4 ? banish.cue : '') as Cue });
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
    <aside className={styles.mission} data-testid="battle-hud" data-ward={readout.ward} data-banished={readout.kills} data-status={readout.status} data-banish-fx={readout.fx} data-modes={readout.modes} aria-label="Battle objective">
      <span className={styles.chapter}>I / THE BREACH</span>
      <strong>{readout.status === 'victory' ? 'The gate is secured' : 'Banish the abyssal host'}</strong>
      <span>{readout.status === 'victory' ? 'Victory · continue your flight' : `${Math.min(BATTLE.goal, readout.kills)} / ${BATTLE.goal} banished`}</span>
      <div className={styles.ward} aria-label={`Protective ward: ${readout.ward} of ${BATTLE.ward}`}>
        {[0, 1, 2].map(i => <i key={i} data-lit={readout.ward > i} />)}<span>WARD</span>
      </div>
    </aside>
    {readout.charging && <p className={styles.warning} role="status">Fiery dart · raise the shield or keep moving</p>}
    {readout.rebuke && <p className={styles.rebuke} role="status">“May the Lord rebuke you!” <cite>Jude 9</cite></p>}
    {CUES[readout.cue] && <p className={styles.cue} role="status">{CUES[readout.cue]}</p>}
    {readout.status === 'battle' && NEXT[readout.next]?.[0] && <p className={styles.next} role="status" data-testid="next-move">
      <span className={styles.coarse}>{NEXT[readout.next][0]}</span><span className={styles.fine}>{NEXT[readout.next][1]}</span></p>}
    {readout.status === 'battle' && <p className={styles.legend} aria-label="Combat strokes">
      <span className={styles.coarse}>Tap a demon: rebuke · swipe: sword · circle: bind · flick down: cast · hold a 2nd finger: shield</span>
      <span className={styles.fine}>Click or C: next step · 1 rebuke · 2 sword · 3 bind · 4 cast · hold V: shield</span></p>}
    {readout.hurt && <div className={styles.hurt} aria-hidden="true" />}
    <div className="sr-only" aria-live="polite">{readout.status === 'victory' ? 'Victory. The gate is secured.' : `Protective ward ${readout.ward} of three. ${readout.kills} enemies banished.`}</div>
  </>;
}

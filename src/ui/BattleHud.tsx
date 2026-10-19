'use client';
import { useEffect, useState } from 'react';
import { battle, BATTLE, resetBattle } from '@/game/celestialBattle';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { pause, resume } from './useInput';
import Modal from './Modal';
import styles from './BattleHud.module.css';

const sample = () => ({ ward: battle.ward, kills: battle.banished, status: battle.status, hurt: battle.hurt > 0, charging: battle.charging >= 0 });
export default function BattleHud() {
  const [readout, setReadout] = useState(sample), paused = useGame(s => s.paused);
  useEffect(() => {
    const tick = () => { const s = sample(); setReadout(old => Object.keys(s).every(k => s[k as keyof typeof s] === old[k as keyof typeof s]) ? old : s);
      if (s.status === 'fallen' && !useGame.getState().paused) pause(); };
    const id = setInterval(tick, 100); return () => clearInterval(id);
  }, []);
  const retry = () => { resetBattle(runtime.shooter.stats.kills); runtime.reset = true; setReadout(sample()); resume(); };
  if (readout.status === 'fallen') return <Modal title="Your ward is broken" onClose={retry}>
    <p>The host has driven you back. Your sanctuary remains. Regroup, take wing, and try again.</p>
    <button className={styles.retry} onClick={retry}>Regroup at the sanctuary</button>
  </Modal>;
  if (paused) return null;
  return <>
    <aside className={styles.mission} data-testid="battle-hud" data-ward={readout.ward} data-banished={readout.kills} data-status={readout.status} aria-label="Battle objective">
      <span className={styles.chapter}>I / THE BREACH</span>
      <strong>{readout.status === 'victory' ? 'The gate is secured' : 'Banish the abyssal host'}</strong>
      <span>{readout.status === 'victory' ? 'Victory · continue your flight' : `${Math.min(BATTLE.goal, readout.kills)} / ${BATTLE.goal} banished`}</span>
      <div className={styles.ward} aria-label={`Protective ward: ${readout.ward} of ${BATTLE.ward}`}>
        {[0, 1, 2].map(i => <i key={i} data-lit={readout.ward > i} />)}<span>WARD</span>
      </div>
    </aside>
    {readout.charging && <p className={styles.warning} role="status">Incoming fire · keep moving</p>}
    {readout.hurt && <div className={styles.hurt} aria-hidden="true" />}
    <div className="sr-only" aria-live="polite">{readout.status === 'victory' ? 'Victory. The gate is secured.' : `Protective ward ${readout.ward} of three. ${readout.kills} enemies banished.`}</div>
  </>;
}

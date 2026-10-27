'use client';
import { bossRuntime } from '@/game/bossRuntime';
import styles from './BossHud.module.css';

export default function BossHud() {
  const boss = bossRuntime.boss;
  const combat = bossRuntime.combat;
  const hpPct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));

  return (
    <>
      {/* Intro Hades-Style Title Banner */}
      {boss.bannerVisible && (
        <div className={styles.introBanner} role="status" aria-live="polite">
          <h2>SEMJAZA</h2>
          <p>CHIEF OF THE TWO HUNDRED · THE FALLEN WATCHER</p>
        </div>
      )}

      {/* Persistent Boss Health Bar */}
      <div className={styles.bossHud} role="region" aria-label="Boss encounter status">
        <div className={styles.bossHeader}>
          <span>SEMJAZA</span>
          <span className={styles.bossTitle}>{boss.phase === 2 ? 'PHASE II · SHATTERED FIRMAMENT' : 'THE DESCENT'}</span>
        </div>

        <div className={styles.healthTrack}>
          <div className={styles.healthFill} style={{ width: `${hpPct}%` }} />
          <div className={styles.phaseNotch} title="Phase transition threshold (50%)" />
        </div>

        {/* Covenant Wards */}
        <div className={styles.wards} aria-label={`Covenant Wards: ${combat.covenantWards} of ${combat.maxWards}`}>
          {[...Array(combat.maxWards)].map((_, i) => (
            <div
              key={i}
              className={`${styles.wardPip} ${i >= combat.covenantWards ? styles.wardEmpty : ''}`}
            />
          ))}
        </div>
      </div>
    </>
  );
}

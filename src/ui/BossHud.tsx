'use client';
import { useEffect, useRef } from 'react';
import { bossRuntime } from '@/game/bossRuntime';
import { useBossInput } from './useBossInput';
import styles from './BossHud.module.css';

export default function BossHud() {
  useBossInput();
  const hpFillRef = useRef<HTMLDivElement>(null);
  const staggerFillRef = useRef<HTMLDivElement>(null);
  const staggerTrackRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const wardsRef = useRef<HTMLDivElement>(null);

  const boss = bossRuntime.boss;
  const combat = bossRuntime.combat;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const b = bossRuntime.boss;
      const c = bossRuntime.combat;

      if (hudRef.current) {
        hudRef.current.style.display = b.state === 'defeated' ? 'none' : 'flex';
      }

      if (hpFillRef.current) {
        const hpPct = Math.max(0, Math.min(100, (b.hp / b.maxHp) * 100));
        hpFillRef.current.style.width = `${hpPct}%`;
      }

      if (staggerFillRef.current) {
        const stagPct = Math.max(0, Math.min(100, (b.stagger / b.maxStagger) * 100));
        staggerFillRef.current.style.width = `${stagPct}%`;
      }

      if (staggerTrackRef.current) {
        staggerTrackRef.current.classList.toggle(styles.staggerBroken, b.state === 'stagger');
      }

      if (titleRef.current) {
        const phaseText = b.state === 'stagger'
          ? 'POSTURE BROKEN · VULNERABLE'
          : b.phase === 2
          ? 'PHASE II · SHATTERED FIRMAMENT'
          : 'THE DESCENT';
        if (titleRef.current.textContent !== phaseText) {
          titleRef.current.textContent = phaseText;
        }
      }

      if (wardsRef.current) {
        const pips = wardsRef.current.children;
        for (let i = 0; i < pips.length; i++) {
          pips[i].classList.toggle(styles.wardEmpty, i >= c.covenantWards);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {/* Intro Hades-Style Title Banner */}
      {boss.bannerVisible && (
        <div className={styles.introBanner} role="status" aria-live="polite">
          <h2>SEMJAZA</h2>
          <p>CHIEF OF THE TWO HUNDRED · THE FALLEN WATCHER</p>
        </div>
      )}

      {/* Persistent Boss Health & Posture HUD */}
      <div ref={hudRef} className={styles.bossHud} role="region" aria-label="Boss encounter status">
        <div className={styles.bossHeader}>
          <span>SEMJAZA</span>
          <span ref={titleRef} className={styles.bossTitle}>THE DESCENT</span>
        </div>

        <div className={styles.healthTrack}>
          <div ref={hpFillRef} className={styles.healthFill} style={{ width: '100%' }} />
          <div className={styles.phaseNotch} title="Phase transition threshold (50%)" />
        </div>

        {/* Posture Stagger Bar */}
        <div ref={staggerTrackRef} className={styles.staggerTrack} title="Posture Stagger Bar">
          <div ref={staggerFillRef} className={styles.staggerFill} />
        </div>

        {/* Covenant Wards */}
        <div ref={wardsRef} className={styles.wards} aria-label={`Covenant Wards: ${combat.covenantWards} of ${combat.maxWards}`}>
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

import type { ReactNode } from 'react';
import styles from './Experience.module.css';
// The landing page's static words (the brand, the title, the start card and the footer) and the failed world's card, split out of Experience so
// that file stays under its line budget. Everything here is plain DOM over the Canvas: no three.js, no store, no lazy chunk of its own (the
// first-visit demo note comes in through `children`, from the one ControlsEntry call site in Experience).
type Props = { started: boolean; failed: boolean; ready: boolean; zoomNote: boolean; note: string; onEnter: () => void; onRetry: () => void; children?: ReactNode };

/** The brand mark and wordmark in the top row (landing and the failed world only). */
export function Brand() {
  return <div className={styles.brand}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 26V6h5v8h12V6h5v20h-5v-8H10v8Z" fill="currentColor" /></svg><span>HALAVERGA<small>WAR IN HEAVEN</small></span></div>;
}

export default function Landing({ started, failed, ready, zoomNote, note, onEnter, onRetry, children }: Props) {
  const off = started || failed;
  return <>
    {/* The title and the start card are one bottom-anchored column (Experience.module.css .hero): a taller card pushes the title up, never into it. */}
    <div className={off ? styles.heroOff : styles.hero}><h1 className={off ? 'sr-only' : styles.heroTitle}>Heaven<br /><em>at war.</em></h1>
      {failed && <div className={styles.recovery} role="alert"><h2>The world needs a moment.</h2><p>Your field guide remains available. Reload the scene to continue from your saved landing.</p>{note && <p>{note}</p>}<button className={styles.primary} onClick={onRetry}>Reload scene</button></div>}
      {!off && <section className={styles.intro} aria-label="Begin expedition">
        <p className={styles.eyebrow}><span className={styles.statusDot} /> CHAPTER I <span>/</span> THE BREACH</p>
        <p className={styles.introCopy}>Take wing against the abyssal host.<br />Banish eight adversaries. Seal the breach.</p>
        <button className={styles.primary} disabled={!ready} onClick={onEnter}>{ready ? 'Begin expedition' : 'Calling your angel…'}<span aria-hidden="true">↗</span></button>
        <p className={styles.introHint} role="status">{note || (zoomNote ? 'Pinch out to normal size, then tap Begin.' : ready ? <><span className={styles.fineHint}>Space to take wing · C to cast holy fire.</span><span className={styles.coarseHint}>Drag to fly · tap an adversary to cast.</span></> : 'Raising the sanctuary above the abyss.')}</p>
        {children}
      </section>}</div>
    {!started && <footer className={styles.introFooter}><span>REVELATION XII <small>WAR IN HEAVEN</small><b>—</b> THE BREACH <small>FIRST SANCTUARY</small></span><span>ANGELS / ABYSSAL HOST <i>01</i></span></footer>}
  </>;
}

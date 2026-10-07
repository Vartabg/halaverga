import type { ReactNode } from 'react';
import styles from './Experience.module.css';
// The landing page's static words (the brand, the title, the start card and the footer) and the failed world's card, split out of Experience so
// that file stays under its line budget. Everything here is plain DOM over the Canvas: no three.js, no store, no lazy chunk of its own (the
// first-visit demo note comes in through `children`, from the one ControlsEntry call site in Experience).
type Props = { started: boolean; failed: boolean; ready: boolean; zoomNote: boolean; note: string; onEnter: () => void; onRetry: () => void; children?: ReactNode };

/** The brand mark and wordmark in the top row (landing and the failed world only). */
export function Brand() {
  return <div className={styles.brand}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 26V6h5v8h12V6h5v20h-5v-8H10v8Z" fill="currentColor" /></svg><span>HALAVERGA<small>RETURN TO EARTH</small></span></div>;
}

export default function Landing({ started, failed, ready, zoomNote, note, onEnter, onRetry, children }: Props) {
  const off = started || failed;
  return <>
    {/* The title and the start card are one bottom-anchored column (Experience.module.css .hero): a taller card pushes the title up, never into it. */}
    <div className={off ? styles.heroOff : styles.hero}><h1 className={off ? 'sr-only' : styles.heroTitle}>Earth,<br /><em>after us.</em></h1>
      {failed && <div className={styles.recovery} role="alert"><h2>The world needs a moment.</h2><p>Your field guide remains available. Reload the scene to continue from your saved landing.</p>{note && <p>{note}</p>}<button className={styles.primary} onClick={onRetry}>Reload scene</button></div>}
      {!off && <section className={styles.intro} aria-label="Begin expedition">
        <p className={styles.eyebrow}><span className={styles.statusDot} /> EXPEDITION 001 <span>/</span> MERIDIAN</p>
        <p className={styles.introCopy}>Eighty years of silence.<br />An entire world still waiting to be understood.</p>
        <button className={styles.primary} disabled={!ready} onClick={onEnter}>{ready ? 'Begin expedition' : 'Preparing your suit…'}<span aria-hidden="true">↗</span></button>
        <p className={styles.introHint} role="status">{note || (zoomNote ? 'Pinch out to normal size, then tap Begin.' : ready ? 'Explore freely. Leave whenever you like.' : 'Building the district and collision map.')}</p>
        {children}
      </section>}</div>
    {!started && <footer className={styles.introFooter}><span>2033 <small>CATASTROPHE</small><b>—</b> 2113 <small>ARRIVAL</small></span><span>INTERACTIVE FLIGHT STUDY <i>01</i></span></footer>}
  </>;
}

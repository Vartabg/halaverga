import type { ReactNode } from 'react';
import styles from './Experience.module.css';
// The landing page's static words (the brand, the title, the start card and the footer) and the failed world's card, split out of Experience so
// that file stays under its line budget. Everything here is plain DOM over the Canvas: no three.js, no store, no lazy chunk of its own (the
// first-visit demo note comes in through `children`, from the one ControlsEntry call site in Experience).
type Props = { started: boolean; failed: boolean; ready: boolean; zoomNote: boolean; note: string; onEnter: () => void; onRetry: () => void; children?: ReactNode };

/** The brand mark and wordmark in the top row (landing and the failed world only). */
export function Brand() {
  return <div className={styles.brand}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 26V6h5v8h12V6h5v20h-5v-8H10v8Z" fill="currentColor" /></svg><span>Halaverga</span></div>;
}

export default function Landing({ started, failed, ready, zoomNote, note, onEnter, onRetry, children }: Props) {
  const off = started || failed;
  return <>
    <div className={off ? styles.heroOff : styles.hero}>
      {off && <h1 className="sr-only">Mount Hermon</h1>}
      {failed && <div className={styles.recovery} role="alert"><h2>The world needs a moment.</h2><p>Your field guide remains available. Reload the scene to continue from your saved landing.</p>{note && <p>{note}</p>}<button className={styles.primary} onClick={onRetry}>Reload scene</button></div>}
      {!off && <section className={styles.intro} aria-label="Ascend Mount Hermon">
        <h1 className={styles.heroTitle}>Mount Hermon</h1>
        <p className={styles.introSource} data-testid="entry-source">The Watchers descend in 1 Enoch 6.</p>
        <p className={styles.introCopy} data-testid="entry-objective">Fly into the valley and defeat eight Watchers.</p>
        <button className={styles.primary} disabled={!ready} onClick={onEnter}>{ready ? 'Ascend Mount Hermon' : 'Loading scene…'}</button>
        <p className={styles.introHint} role="status">{note || (zoomNote ? 'Pinch out to normal size, then tap Ascend.' : ready ? <><span className={styles.fineHint}>Space to take off · C to strike.</span><span className={styles.coarseHint}>Hold Fly to move · release to hover.</span></> : 'Preparing the flight area.')}</p>
        {children}
      </section>}</div>
  </>;
}

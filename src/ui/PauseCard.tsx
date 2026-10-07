import { useEffect, useId, useRef, useState } from 'react';
import { persistGame, useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { touchMode } from '@/game/pointerMode';
import { computeLayout } from '@/game/touchLayout';
import { headerBand, readInsets, viewportBox } from './touchInsets';
import { isStandalone, keepPlaying, leaveGame } from './playSession';
import LazyControls from './LazyControls';
import styles from './Experience.module.css';
type Props = { ready: boolean; onEnter: () => void; note?: string };
// Would the touch cluster fit this screen? The same pure layout the controls use, from the visual viewport and the safe areas.
function crampedNow(probe: HTMLElement | null): boolean {
  if (!probe || !touchMode()) return false;
  const s = useGame.getState(), box = viewportBox(), insets = readInsets(probe);
  const top = headerBand(box, insets.top);
  const prefs = { size: s.controlSize, flip: s.flipSides, fire: s.shooter, aim: s.shooter && s.aimButton && !s.tapControls, tapPad: s.tapControls };
  return computeLayout(box.w, box.h, insets, top, prefs).cramped;
}
/** The pause card, the "Leave the game?" card (a back swipe during touch play) and the notes that explain a refused Resume. */
export default function PauseCard({ ready, onEnter, note = '' }: Props) {
  const leave = useGame(s => s.leavePrompt), zoomNote = useGame(s => s.zoomNote), shooter = useGame(s => s.shooter);
  const tipSeen = useGame(s => s.homeTipSeen);
  const probe = useRef<HTMLDivElement>(null), card = useRef<HTMLElement>(null), go = useRef<HTMLButtonElement>(null), kicker = useId();
  const [cramped, setCramped] = useState(false), [tip, setTip] = useState(false);
  useEffect(() => {
    const update = () => { setCramped(crampedNow(probe.current)); setTip(touchMode() && !isStandalone()); };
    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update); window.addEventListener('resize', update);
    return () => { vv?.removeEventListener('resize', update); window.removeEventListener('resize', update); };
  }, []);
  // A fresh card puts focus on its first action. A disabled button cannot take it (the suit is still restoring), so the card holds it
  // until the action is ready, then hands it over: focus never falls back to the page behind.
  useEffect(() => {
    if (!ready) card.current?.focus({ preventScroll: true });
    else if (document.activeElement === card.current) go.current?.focus({ preventScroll: true });
  }, [ready]);
  const probeNode = <div ref={probe} className={styles.insetProbe} aria-hidden="true" />;
  if (leave) return <section ref={card} tabIndex={-1} className={styles.pauseCard} aria-label="Leave the game">
    {probeNode}
    <h2>Leave the game?</h2><p>Your progress is saved.</p>
    <button ref={go} className={styles.primary} autoFocus disabled={!ready} onClick={() => { useGame.setState({ leavePrompt: false }); keepPlaying(); onEnter(); }}>Keep playing <span aria-hidden="true">↗</span></button>
    <button className={styles.secondary} onClick={leaveGame}>Leave</button>
  </section>;
  // The Home Screen tip is one muted line, not a card with a button: it counts as seen when Resume is pressed with it on screen.
  const showTip = tip && !tipSeen;
  const resume = () => { if (showTip) { useGame.setState({ homeTipSeen: true }); persistGame(); } onEnter(); };
  // The kicker is the card's name made visible ("Expedition paused", the region's label since the cleanup): one line, read once.
  return <section ref={card} tabIndex={-1} className={styles.pauseCard} aria-labelledby={kicker}>
    {probeNode}
    <p id={kicker} className={styles.kicker}>Expedition paused</p>
    <h2>Take your time.</h2>
    {shooter && runtime.shooter.stats.kills > 0 && <p>Drones downed: {runtime.shooter.stats.kills}</p>}
    <p className={styles.note} role="status">{note || (zoomNote ? 'Pinch out to normal size, then tap Resume.' : cramped ? 'Screen too short for touch controls. Zoom out or turn the phone.' : '')}</p>
    <button ref={go} className={styles.primary} autoFocus disabled={!ready} onClick={resume}>{ready ? 'Resume flight' : 'Restoring your suit…'} <span aria-hidden="true">↗</span></button>
    {/* The doors, one list of rows: the vote door (when it works), the Controls row and its tried line come from the chunk below (V4: the vote door is
        right under Resume for players who are asked, after the Controls row for everyone else, and its words cost the landing page nothing). The
        Controls sheet and the vote card (VoteLayer) open over the paused game; this card hides while they show and returns when they close. */}
    <div className={styles.pauseRows}>
      <LazyControls />
      <div className={styles.pair}>
        <button className={styles.secondary} onClick={() => useGame.setState({ journal: true })}>Field guide</button>
        <button className={styles.secondary} aria-describedby="settings-hint" onClick={() => useGame.setState({ panel: true })}>Flight settings</button>
        <p id="settings-hint" className={`${styles.pauseNote} ${styles.settingsHint}`}>Size, left-handed, look speed</p>
      </div>
    </div>
    <p className={`${styles.pauseNote} ${styles.portraitLine}`}>Best played sideways.</p>
    {showTip && <p className={styles.pauseNote}>Tip: Share › Add to Home Screen for full screen.</p>}
  </section>;
}

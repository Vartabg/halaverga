import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { persistGame, useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { touchMode } from '@/game/pointerMode';
import { computeLayout } from '@/game/touchLayout';
import { headerBand, readInsets, viewportBox } from './touchInsets';
import { isStandalone, keepPlaying, leaveGame } from './playSession';
import styles from './Experience.module.css';
type Props = { ready: boolean; onEnter: () => void };
// The live control switch (Standard, Draw, Conduct, Brush) is a chunk: the landing first load carries no lab picker.
const LabSwitch = dynamic(() => import('./gesture/LabSwitch'), { ssr: false, loading: () => null });
// Would the touch cluster fit this screen? The same pure layout the controls use, from the visual viewport and the safe areas.
function crampedNow(probe: HTMLElement | null): boolean {
  if (!probe || !touchMode()) return false;
  const s = useGame.getState(), box = viewportBox(), insets = readInsets(probe);
  const top = headerBand(box, insets.top);
  const prefs = { size: s.controlSize, flip: s.flipSides, fire: s.shooter, aim: s.shooter && s.aimButton && !s.tapControls, tapPad: s.tapControls };
  return computeLayout(box.w, box.h, insets, top, prefs).cramped;
}
/** The pause card, the "Leave the game?" card (a back swipe during touch play) and the notes that explain a refused Resume. */
export default function PauseCard({ ready, onEnter }: Props) {
  const leave = useGame(s => s.leavePrompt), zoomNote = useGame(s => s.zoomNote), shooter = useGame(s => s.shooter);
  const tipSeen = useGame(s => s.homeTipSeen), nudge = useGame(s => s.voteNudge);
  const probe = useRef<HTMLDivElement>(null);
  const [cramped, setCramped] = useState(false), [tip, setTip] = useState(false);
  useEffect(() => {
    const update = () => { setCramped(crampedNow(probe.current)); setTip(touchMode() && !isStandalone()); };
    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update); window.addEventListener('resize', update);
    return () => { vv?.removeEventListener('resize', update); window.removeEventListener('resize', update); };
  }, []);
  const probeNode = <div ref={probe} className={styles.insetProbe} aria-hidden="true" />;
  if (leave) return <section className={styles.pauseCard} aria-label="Leave the game">
    {probeNode}
    <h2>Leave the game?</h2><p>Your progress is saved.</p>
    <button className={styles.primary} autoFocus disabled={!ready} onClick={() => { useGame.setState({ leavePrompt: false }); keepPlaying(); onEnter(); }}>Keep playing <span aria-hidden="true">↗</span></button>
    <button className={styles.secondary} onClick={leaveGame}>Leave</button>
  </section>;
  const gotIt = () => { useGame.setState({ homeTipSeen: true }); persistGame(); };
  return <section className={styles.pauseCard} aria-label="Expedition paused">
    {probeNode}
    <p className={styles.eyebrow}>SUIT HOLDING POSITION</p><h2>Take your time.</h2><p>Your expedition will be here.</p>
    {shooter && runtime.shooter.stats.kills > 0 && <p>Drones downed: {runtime.shooter.stats.kills}</p>}
    <p className={styles.note} role="status">{zoomNote ? 'Pinch out to normal size, then tap Resume.' : cramped ? 'Screen too short for touch controls. Zoom out or turn the phone.' : ''}</p>
    <button className={styles.primary} disabled={!ready} onClick={onEnter}>{ready ? 'Resume flight' : 'Restoring your suit…'} <span aria-hidden="true">↗</span></button>
    <LabSwitch name="control-lab-pause" />
    <button className={styles.secondary} onClick={() => useGame.setState({ panel: true })}>Adjust flight settings</button>
    {/* The vote card (VoteLayer) opens over the paused game; this card hides while it shows and returns after Skip. Eligible
        players (two styles tried, 3 minutes) see the ask first, since they may never land to get the auto-open. */}
    {nudge && <p className={styles.voteAsk}>You tried more than one style. Which did you like?</p>}
    <button className={`${styles.secondary} ${styles.voteOpen}`} data-testid="vote-open" data-nudge={nudge ? '' : undefined} onClick={() => useGame.setState({ voteOpen: true })}>Vote on the controls</button>
    <p className={styles.portraitLine}>Best played sideways.</p>
    {tip && !tipSeen && <div className={styles.homeTip}><p>Tip: Share › Add to Home Screen for full screen.</p><button className={styles.secondary} onClick={gotIt}>Got it</button></div>}
  </section>;
}

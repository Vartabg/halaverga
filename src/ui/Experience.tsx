'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { hydrateGame, overrideShooter, useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { clearShooterFault, shooterFault } from '@/game/shooterFault';
import { pause, resume, useInput } from './useInput';
import { useShooterInput } from './useShooterInput';
import { usePlayGuard } from './usePlayGuard';
import { onPlayGesture } from './playSession';
import { useFieldGuide } from './useFieldGuide';
import { touchMode } from '@/game/pointerMode';
import { unlockBlasterAudio } from './audioUnlock';
import { useAudio } from './useAudio';
import { trackpadPill } from './trackpadPill';
import { coarsePointer } from './hintQueue';
import { labFault } from './labSwitch';
import Boundary from './Boundary';
import TapControls from './TapControls';
import Telemetry from './Telemetry';
import HintSlot, { useMessageClock } from './HintSlot';
import FlowWelcome from './FlowWelcome';
import PauseCard from './PauseCard';
import SheetLost from './SheetLost';
import styles from './Experience.module.css';
const Scene = dynamic(() => import('@/world/Scene'), { ssr: false });
// The blaster HUD is its own chunk: the landing page's first load carries no shooter UI. It is warmed once the setting is on.
const Reticle = () => <div className={styles.reticle} aria-hidden="true"><span /></div>;
const loadHud = () => import('./ShooterHud');
const ShooterHud = dynamic(loadHud, { ssr: false, loading: Reticle });
// The touch controls (stick, look, cluster) are a chunk too: loaded right after hydration, and Begin waits for them.
// The loaded component is held in state (not next/dynamic, whose React.lazy suspends on every first mount), so the surface is
// there on the very frame Begin starts play and the first click or touch never lands on nothing. No static import of
// './TouchControls' anywhere on the landing path.
const loadTouch = () => import('./TouchControls');
// The controls lessons (one mount, standard controls only: they publish their line to the one hint slot). Its own small chunk, warmed after hydration.
const loadHint = () => import('./ControlsHint');
const ControlsHint = dynamic(loadHint, { ssr: false, loading: () => null });
// The Flow and Simple trackpad panels are passive and belong to non-default profiles (the free cursor is the desktop default): their own
// chunks, fetched only when that profile is on after Begin. A chunk that fails to load leaves the panel out; the controls themselves are not in it.
const FlowHud = dynamic(() => import('./FlowHud'), { ssr: false, loading: () => null });
const SimpleTrackpadHud = dynamic(() => import('./SimpleTrackpadHud'), { ssr: false, loading: () => null });
// Flight settings open only after Begin, so they are a chunk warmed then: settings copy never grows the landing first load.
const loadPanel = () => import('./TestPanel');
// The Gesture Lab (Draw, Conduct, Brush) replaces the standard controls only while chosen. Its surface is held in state like the
// touch controls (loaded when a lab scheme is on, and Begin/Resume waits for it). The controls picker (ControlsEntry: the header
// trigger and, on the start card, the first-visit demo note) and the in-game vote (VoteLayer) are chunks. The landing first load
// carries no lab, picker or vote module: a failed lab chunk returns the session to the standard controls, and a failed picker or
// vote chunk only leaves the header trigger or card out.
type LabProps = { scheme: 'draw' | 'conduct' | 'brush'; onError?: (error: unknown) => void };
const loadLab = () => import('./gesture/LabControls');
const ControlsEntry = dynamic(() => import('./controls/ControlsEntry'), { ssr: false, loading: () => null });
const VoteLayer = dynamic(() => import('./vote/VoteLayer'), { ssr: false, loading: () => null });
// A chunk that fails to load (deploy skew, offline) must not unmount the page: the picker and the vote simply stay out.
const skip = () => {};
const Optional = ({ children }: { children: ReactNode }) => <Boundary fallback={null} onError={skip}>{children}</Boundary>;
const LAB_LOAD_FAILED = 'The Gesture Lab could not load. Standard controls are on.', LAB_FAILED = 'The Gesture Lab stopped. Standard controls are on.';
const TestPanel = dynamic(loadPanel, { ssr: false, loading: () => null });
export default function Experience() {
  const state = useGame(), [hydrated, setHydrated] = useState(false), [failed, setFailed] = useState(false);
  const [sceneKey, setSceneKey] = useState(0), [touchReady, setTouchReady] = useState(false);
  const [TouchControls, setTouchControls] = useState<ComponentType | null>(null);
  const [LabControls, setLabControls] = useState<ComponentType<LabProps> | null>(null);
  const lab = state.controlLab;
  const main = useRef<HTMLElement>(null), guide = useFieldGuide(hydrated);
  useEffect(() => {
    let cancelled = false;
    hydrateGame();
    const query = new URLSearchParams(location.search), profile = query.get('trackpad'), blaster = query.get('shooter');
    // ?shooter=1 / 0 overrides the saved setting for this session only.
    if (blaster === '1') { clearShooterFault(); overrideShooter(true); } else if (blaster === '0') overrideShooter(false);
    if (profile === 'simple' || profile === 'flow' || profile === 'free' || profile === 'captured') useGame.setState({ desktopMode: 'trackpad', trackpadSteering: profile });
    // ?controls= (a session override) comes from a lazy chunk: Begin waits for it, and a failed load still hydrates.
    const go = () => { if (!cancelled) setHydrated(true); }, c = query.get('controls');
    if (c) import('./controls/controlsQuery').then(m => m.applyControlsQuery(c)).catch(() => {}).finally(go); else go();
    return () => { cancelled = true; };
  }, []);
  // A failed chunk still enables Begin: the scene and the keyboard keep working.
  useEffect(() => {
    if (hydrated) void loadTouch().then(m => setTouchControls(() => m.default)).catch(() => {}).finally(() => setTouchReady(true));
  }, [hydrated]);
  // Warm the blaster HUD chunk after hydration so the first aim never waits on it; with the blaster off nothing is requested.
  useEffect(() => { if (hydrated && state.shooter) void loadHud().catch(() => {}); }, [hydrated, state.shooter]);
  useEffect(() => { if (hydrated) void loadHint().catch(() => {}); }, [hydrated]);
  useEffect(() => { if (state.started) void loadPanel().catch(() => {}); }, [state.started]);
  useEffect(() => {
    if (hydrated && lab !== 'standard' && !LabControls) void loadLab().then(m => setLabControls(() => m.default)).catch(() => labFault(LAB_LOAD_FAILED));
  }, [hydrated, lab, LabControls]);
  // html[data-controls]: CSS hides the crosshair while a lab scheme is on.
  useEffect(() => {
    const html = document.documentElement;
    if (lab === 'standard') delete html.dataset.controls; else html.dataset.controls = lab;
    return () => { delete html.dataset.controls; };
  }, [lab]);
  // html[data-touch-blast]: Standard, blaster on, classic one thumb. With html[data-input=touch] the CSS hides the crosshair (the
  // finger aims: tap a drone) and moves the hit marker to the tap, as the lab does. A desktop with the same save keeps its reticle.
  const touchBlast = lab === 'standard' && state.shooter && state.touchScheme === 'classic';
  useEffect(() => {
    const html = document.documentElement;
    if (touchBlast) html.dataset.touchBlast = ''; else delete html.dataset.touchBlast;
    return () => { delete html.dataset.touchBlast; };
  }, [touchBlast]);
  const bar = state.started && !failed;
  useInput(); useAudio(); useShooterInput({ unlock: unlockBlasterAudio }); usePlayGuard();
  const failure = useCallback(() => { setFailed(true); pause(); }, []);
  // Begin/Resume is an activation gesture: it unlocks blaster audio (a no-op while the blaster is off or muted), and it refuses to
  // start while the page is pinch-zoomed (the controls would sit off screen), showing how to recover instead.
  const enter = () => {
    if (!onPlayGesture()) { useGame.setState({ zoomNote: true }); return; }
    useGame.setState({ zoomNote: false }); unlockBlasterAudio(); resume(); main.current?.focus();
  };
  // Closing Flight settings or the Field guide returns to the pause card: Resume is always the player's own tap.
  const closePanel = () => state.set({ panel: false }), closeGuide = () => state.set({ journal: false });
  // A rejected suit-asset load stays cached under its URL, so a bare remount would rethrow the same failure. The
  // clear is imported here rather than at module scope to keep three.js out of the landing page's first load.
  const retry = async () => {
    pause();
    const [{ useLoader }, { GLTFLoader }, { SUIT_URL }] = await Promise.all([
      import('@react-three/fiber'), import('three/addons/loaders/GLTFLoader.js'), import('@/world/Suit')]);
    useLoader.clear(GLTFLoader, SUIT_URL);
    setFailed(false); setSceneKey(v => v + 1); state.set({ ready: false, flying: false, landing: false });
  };
  const fallback = <div className={styles.recovery} role="alert"><h2>The world needs a moment.</h2><p>Your field guide remains available. Reload the scene to continue from your saved landing.</p>{guide.note && <p>{guide.note}</p>}<button className={styles.primary} onClick={retry}>Reload scene</button></div>;
  const standard = lab === 'standard', playing = state.started && !state.paused, twin = state.touchScheme === 'twin';
  const ready = state.ready && touchReady && (standard || !!LabControls);
  const pill = standard && trackpadPill({ steering: state.trackpadSteering, shooter: state.shooter, cruising: state.trackpadFlying, flying: state.flying, canLand: state.canLand });
  useMessageClock();
  return <>
    <a className="skip" href="#field-guide" onClick={() => { pause(); state.set({ journal: true }); }}>Skip to text field guide</a>
    <main id="expedition" ref={main} className={styles.experience} tabIndex={-1} aria-label="Halaverga expedition"
      onContextMenu={e => { if (!(e.target as Element).closest('dialog')) e.preventDefault(); }}>
      <div className={styles.world}>
        {hydrated && !failed && <Boundary key={sceneKey} fallback={null} onError={failure}><Scene onLoss={failure} /></Boundary>}
      </div>
      <div className={`${styles.vignette} ${!state.started ? styles.introVignette : ''}`} aria-hidden="true" />
      <header className={styles.header} data-play={bar ? '' : undefined}>
        {!bar && <div className={styles.brand}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 26V6h5v8h12V6h5v20h-5v-8H10v8Z" fill="currentColor" /></svg><span>HALAVERGA<small>RETURN TO EARTH</small></span></div>}
        {/* The top row: while playing, Vote (when it shows), Controls, Pause; the Field guide and Flight settings are on the pause card. */}
        <div className={styles.headerActions}>
          {bar ? <>
            <Optional><ControlsEntry part="trigger" /></Optional>
            {playing && <button className={styles.pause} onClick={pause} aria-label="Pause expedition"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" /></svg></button>}
          </> : <button id="field-guide" onClick={() => { pause(); state.set({ journal: true }); }}>Field guide</button>}
        </div>
      </header>
      {/* The skip link's target while the row has no Field guide button; the Controls sheet is the header's sibling (it needs no pass-through
          of its own); data-band is the invisible marker touchInsets.headerBand measures (the pre-cleanup band, see --band). */}
      {bar && <><span id="field-guide" className="sr-only" tabIndex={-1} /><Boundary fallback={<SheetLost />} onError={skip}><ControlsEntry part="sheet" /></Boundary></>}
      {state.started && <div className={styles.bandProbe} data-band="" aria-hidden="true" />}
      <div className={state.started || failed ? styles.heroOff : styles.hero}><h1 className={state.started || failed ? 'sr-only' : styles.heroTitle}>Earth,<br /><em>after us.</em></h1>
      {failed && fallback}
      {!state.started && !failed && <section className={styles.intro} aria-label="Begin expedition">
        <p className={styles.eyebrow}><span className={styles.statusDot} /> EXPEDITION 001 <span>/</span> MERIDIAN</p>
        <p className={styles.introCopy}>Eighty years of silence.<br />An entire world still waiting to be understood.</p>
        <button className={styles.primary} disabled={!ready} onClick={enter}>{ready ? 'Begin expedition' : 'Preparing your suit…'}<span aria-hidden="true">↗</span></button>
        <p className={styles.introHint} role="status">{guide.note || (state.zoomNote ? 'Pinch out to normal size, then tap Begin.' : ready ? 'Explore freely. Leave whenever you like.' : 'Building the district and collision map.')}</p>
        <Optional><ControlsEntry part="note" /></Optional>
      </section>}</div>
      {!state.started && <footer className={styles.introFooter}><span>2033 <small>CATASTROPHE</small><b>—</b> 2113 <small>ARRIVAL</small></span><span>INTERACTIVE FLIGHT STUDY <i>01</i></span></footer>}
      {state.started && <>
        {/* A fresh mount per pause state, as on main: the desktop trackpad hooks keep per-session refs (capture, strokes) that
            must reset on resume. inputEpoch moves only in desktop mode; touch controls re-anchor themselves on rotation. */}
        {standard ? TouchControls && <TouchControls key={`${state.paused}-${state.inputEpoch}`} />
          : playing && LabControls && <LabControls key={`${lab}-${state.inputEpoch}`} scheme={lab as LabProps['scheme']} onError={() => labFault(LAB_FAILED)} />}
        {playing && <>
          {state.tapControls && <TapControls key={state.inputEpoch} />}
          {state.shooter ? <Boundary fallback={<Reticle />} onError={() => shooterFault('hud', null)}><ShooterHud /></Boundary> : <Reticle />}
          {/* The controls lessons and the one hint slot under the top row: one line at a time (hintQueue.pickHint). */}
          {standard && <Optional><ControlsHint coarse={coarsePointer()} /></Optional>}
          <HintSlot />
          <Telemetry />
          {/* Twin touch: the cluster's Rise/Descend replace Lift/Land, so CSS hides this under html[data-input=touch]. */}
          {/* In a lab scheme Lift/Land is always shown (data-twin false): the lab has no Rise/Descend. */}
          <div className={styles.actions} data-ghost-avoid="" data-shooter={String(state.shooter)} data-twin={String(twin && standard)}>
            {/* A mouse click activates Lift/Land without focusing it, so the next Space still reaches flight (Tab + Space works). */}
            <button className={styles.action} onMouseDown={e => { if (!touchMode()) e.preventDefault(); }} onClick={() => { runtime.lift = true; }}><span aria-hidden="true">{state.flying ? '↓' : '↑'}</span>{state.landing ? 'Cancel landing' : state.flying ? 'Land' : 'Lift'}</button>
          </div>
          {standard && state.desktopMode === 'trackpad' && state.trackpadSteering === 'flow' && <Optional><FlowHud /></Optional>}
          {standard && state.desktopMode === 'trackpad' && state.trackpadSteering === 'simple' && <Optional><SimpleTrackpadHud /></Optional>}
          {/* The desktop legend: a control caption, not advice, so it stays at the bottom and steps aside for a limit cue. */}
          {state.desktopMode === 'trackpad' && pill && !state.limitHint && <div className={styles.legend} data-testid="legend">{pill}</div>}
        </>}
        {state.paused && !state.panel && !guide.Guide && !failed && !state.voteOpen && !state.controlsOpen && <PauseCard ready={ready} onEnter={enter} note={guide.note} />}
        {!failed && <Optional><VoteLayer onResume={enter} /></Optional>}
      </>}
      <div className="sr-only" aria-live="polite">{state.message}</div>
      {guide.Guide && <Boundary fallback={null} onError={guide.fail}><guide.Guide onClose={closeGuide} /></Boundary>}
      {state.panel && <TestPanel onClose={closePanel} onResume={() => { closePanel(); enter(); }} ready={ready} />}
      {state.started && !failed && standard && state.desktopMode === 'trackpad' && state.trackpadSteering === 'flow' && !state.flowIntroSeen && !state.panel && !state.journal && <FlowWelcome />}
    </main>
  </>;
}

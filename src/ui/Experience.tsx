'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { hydrateGame, persistGame, useGame } from '@/game/store';
import { SUIT_URL } from '@/world/Suit';
import { runtime } from '@/game/runtime';
import { pause, resume, useInput } from './useInput';
import { useAudio } from './useAudio';
import Boundary from './Boundary';
import TouchControls from './TouchControls';
import TapControls from './TapControls';
import FieldGuide from './FieldGuide';
import TestPanel from './TestPanel';
import Telemetry from './Telemetry';
import styles from './Experience.module.css';
const Scene = dynamic(() => import('@/world/Scene'), { ssr: false });
export default function Experience() {
  const state = useGame(), [hydrated, setHydrated] = useState(false), [failed, setFailed] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const main = useRef<HTMLElement>(null);
  useEffect(() => { hydrateGame(); setHydrated(true); }, []);
  useInput(); useAudio();
  const failure = useCallback(() => { setFailed(true); pause(); }, []);
  const enter = () => { resume(); main.current?.focus(); };
  const closePanel = () => { state.set({ panel: false }); if (state.started && state.ready && !failed) enter(); };
  const closeGuide = () => { state.set({ journal: false }); if (state.started && state.ready && !failed) enter(); };
  // A rejected suit-asset load stays cached under its URL, so a bare remount would rethrow the same failure.
  // A rejected suit-asset load stays cached under its URL, so a bare remount would rethrow the same failure.
  const retry = () => { pause(); useLoader.clear(GLTFLoader, SUIT_URL); setFailed(false); setSceneKey(v => v + 1); state.set({ ready: false, flying: false, landing: false }); };
  const fallback = <div className={styles.recovery} role="alert"><h2>The world needs a moment.</h2><p>Your field guide remains available. Reload the scene to continue from your saved landing.</p><button className={styles.primary} onClick={retry}>Reload scene</button></div>;
  const playing = state.started && !state.paused;
  const flightHint = state.message || (state.flying && state.canLand ? 'SURFACE IN REACH · LAND' : state.boundaryNear ? 'SURVEY LIMIT · TURN BACK' : state.clearanceActive ? 'CLEARANCE ASSIST · STEER AROUND' : '');
  useEffect(() => {
    if (!state.message) return;
    const id = setTimeout(() => useGame.setState({ message: '' }), 4000); return () => clearTimeout(id);
  }, [state.message]);
  return <>
    <a className="skip" href="#field-guide" onClick={() => { pause(); state.set({ journal: true }); }}>Skip to text field guide</a>
    <main id="expedition" ref={main} className={styles.experience} tabIndex={-1} aria-label="Halaverga expedition"
      onContextMenu={e => { if (!(e.target as Element).closest('dialog')) e.preventDefault(); }}>
      <div className={styles.world}>
        {hydrated && !failed && <Boundary key={sceneKey} fallback={null} onError={failure}><Scene onLoss={failure} /></Boundary>}
      </div>
      <div className={`${styles.vignette} ${!state.started ? styles.introVignette : ''}`} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.brand}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 26V6h5v8h12V6h5v20h-5v-8H10v8Z" fill="currentColor" /></svg><span>HALAVERGA<small>RETURN TO EARTH</small></span></div>
        <div className={styles.headerActions}>
          <button id="field-guide" onClick={() => { pause(); state.set({ journal: true }); }}>Field guide</button>
          {state.started && <button onClick={() => { pause(); state.set({ panel: true }); }} aria-label="Flight settings">⚙</button>}
          {playing && <button onClick={pause} aria-label="Pause expedition">Ⅱ</button>}
        </div>
      </header>
      <h1 className={state.started || failed ? 'sr-only' : styles.heroTitle}>Earth,<br /><em>after us.</em></h1>
      {failed && fallback}
      {!state.started && !failed && <section className={styles.intro} aria-label="Begin expedition">
        <p className={styles.eyebrow}><span className={styles.statusDot} /> EXPEDITION 001 <span>/</span> MERIDIAN</p>
        <p className={styles.introCopy}>Eighty years of silence.<br />An entire world still waiting to be understood.</p>
        <button className={styles.primary} disabled={!state.ready} onClick={enter}>{state.ready ? 'Begin expedition' : 'Preparing your suit…'}<span aria-hidden="true">↗</span></button>
        <p className={styles.introHint} role="status">{state.ready ? 'Explore freely. Leave whenever you like.' : 'Building the district and collision map.'}</p>
      </section>}
      {!state.started && <footer className={styles.introFooter}><span>2033 <small>CATASTROPHE</small><b>—</b> 2113 <small>ARRIVAL</small></span><span>INTERACTIVE FLIGHT STUDY <i>01</i></span></footer>}
      {state.started && <>
        <TouchControls key={`${state.paused}-${state.inputEpoch}`} />
        {playing && <>
          {state.tapControls && <TapControls key={state.inputEpoch} />}
          <div className={styles.reticle} aria-hidden="true"><span /></div>
          {flightHint && <p className={styles.flightHint}>{flightHint}</p>}
          <Telemetry />
          <div className={styles.actions}>
            <button className={styles.action} onClick={() => { runtime.lift = true; }}><span aria-hidden="true">{state.flying ? '↓' : '↑'}</span>{state.landing ? 'Cancel landing' : state.flying ? 'Land' : 'Lift'}</button>
          </div>
          {state.nearTerminal && <button className={styles.discovery} onClick={() => { pause(); state.set({ discovered: true, journal: true }); persistGame(); }}>◇ Municipal record <span>Read ↗</span></button>}
          {!state.flying && <div className={styles.touchHint} aria-hidden="true">ONE THUMB TO FLY · TWO TO MOVE + LOOK</div>}
          {state.desktopMode === 'trackpad' && <div className={styles.trackpadHint}>{state.trackpadFlying ? `MOVE TO STEER · SCROLL FOR SPEED · CLICK TO ${state.trackpadSteering === 'captured' ? 'HOVER + RELEASE' : 'HOVER'}` : 'CLICK TO FLY · DRAG TO LOOK'}</div>}
        </>}
        {state.paused && !state.panel && !state.journal && !failed && <section className={styles.pauseCard} aria-label="Expedition paused">
          <p className={styles.eyebrow}>SUIT HOLDING POSITION</p><h2>Take your time.</h2><p>Your expedition will be here.</p>
          <button className={styles.primary} disabled={!state.ready} onClick={enter}>{state.ready ? 'Resume flight' : 'Restoring your suit…'} <span aria-hidden="true">↗</span></button>
          <button className={styles.secondary} onClick={() => state.set({ panel: true })}>Adjust flight settings</button>
        </section>}
      </>}
      <div className="sr-only" aria-live="polite">{state.message}</div>
      {state.journal && <FieldGuide onClose={closeGuide} />}
      {state.panel && <TestPanel onClose={closePanel} />}
    </main>
  </>;
}

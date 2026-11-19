'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import Boundary from '@/ui/Boundary';
import { createCrossing, launchCrossing, type CrossingInput, type Phase } from './flight';
import { useCrossingInput } from './useCrossingInput';
import { account, warningBeat, warningWords, type WarningBeat } from './warning';
import styles from './Crossing.module.css';

const World = dynamic(() => import('./CrossingWorld'), { ssr: false });

export default function Crossing() {
  const [flight] = useState(createCrossing);
  const [input] = useState<CrossingInput>(() => ({ horizontal: 0, vertical: 0, strike: false }));
  const [view, setView] = useState<{ phase: Phase; inReach: boolean; beat: WarningBeat }>(
    () => ({ phase: flight.phase, inReach: false, beat: warningBeat(flight) }));
  const [ready, setReady] = useState(false), [fault, setFault] = useState(false);
  const [paused, setPaused] = useState(false), [reduced, setReduced] = useState(false);
  const stage = useRef<HTMLElement>(null), primary = useRef<HTMLButtonElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const airborne = view.phase === 'flight' || view.phase === 'strike';
  const onReady = useCallback(() => setReady(true), []);
  const onLoss = useCallback(() => { setFault(true); setPaused(true); }, []);
  const onChange = useCallback((phase: Phase, inReach: boolean, beat: WarningBeat) => {
    setView(current => current.phase === phase && current.inReach === inReach && current.beat === beat ? current : { phase, inReach, beat });
  }, []);
  const onPause = useCallback(() => setPaused(true), []);
  const controls = useCrossingInput(input, view.phase === 'flight' && !paused && !fault);

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update(); preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!airborne || paused || fault) return;
    const hide = () => { if (document.hidden) onPause(); };
    const orient = matchMedia('(orientation: portrait)');
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', onPause);
    orient.addEventListener('change', onPause);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', onPause);
      orient.removeEventListener('change', onPause);
    };
  }, [airborne, paused, fault, onPause]);
  useEffect(() => {
    if (fault || (ready && (!airborne || paused))) primary.current?.focus({ preventScroll: true });
  }, [airborne, ready, paused, fault]);

  function enter(fresh: boolean) {
    controls.clear();
    if (fresh) { launchCrossing(flight); onChange(flight.phase, flight.inReach, warningBeat(flight)); }
    setPaused(false);
    stage.current?.focus({ preventScroll: true });
  }

  const opening = view.phase === 'ready', safe = view.phase === 'safe';
  const ending = safe || view.phase === 'late';
  const panel = opening || paused || ending || fault;
  const title = fault ? 'The scene stopped' : paused ? 'Flight paused' : opening ? account.title
    : safe ? 'The travelers cross.' : 'The travelers turn back.';

  return <main ref={stage} className={styles.stage} tabIndex={-1} aria-label="The Cloven Arch flight"
    aria-describedby="crossing-description" data-phase={view.phase} data-in-reach={view.inReach} data-story-beat={view.beat}
    onKeyDown={event => {
      if (event.code !== 'Escape' || event.repeat || !airborne || fault) return;
      event.preventDefault();
      if (paused) enter(false); else onPause();
    }}>
    <span id="crossing-description" className="sr-only">The Watcher flies low on the left, then rises to the right near the stone arch.
      Steer with the arrow keys. Strike with Space when the Watcher is in reach.</span>
    {!fault && <Boundary fallback={null} onError={onLoss}>
      <World flight={flight} input={input} marker={marker} paused={paused} reduced={reduced} onChange={onChange} onReady={onReady} onLoss={onLoss} />
    </Boundary>}
    {!panel && <>
      <div className={styles.surface} data-testid="crossing-surface" aria-hidden="true" {...controls.surface} />
      {view.phase === 'flight' && <div className={styles.marker} ref={marker} hidden aria-hidden="true"><i />Watcher</div>}
      {airborne && warningWords[view.beat] && <p className={styles.voice} aria-hidden="true">{warningWords[view.beat]}</p>}
      <button className={styles.pause} onClick={onPause}>Pause</button>
      {view.phase === 'flight' && <button className={styles.strike} data-reach={view.inReach}
        aria-label="Strike the Watcher" onClick={() => { input.strike = true; }}>
        <span>Strike</span><small>{view.inReach ? 'In reach' : 'Fly closer'}</small>
      </button>}
    </>}
    {panel && <section className={styles.panel} data-opening={opening && !fault} data-ending={ending && !paused && !fault} aria-labelledby="crossing-title">
      {opening && !fault && <p className={styles.place}>Mount Hermon · Fiction after 1 Enoch 6</p>}
      <h1 id="crossing-title">{title}</h1>
      {fault ? <p>The flight needs to reload. You can start again at the ridge.</p>
        : opening ? <><p>{account.opening}</p>
          <p className={styles.hint}><span className={styles.keyControls}>Arrow keys to steer. Space to strike.</span>
          <span className={styles.thumbControls}>Drag to steer. Lift to strike in reach.</span></p></>
        : ending && !paused ? <p className={styles.afterword}>{warningWords[view.beat]}</p> : null}
      <div className={styles.actions}>
      {fault ? <button className={styles.primary} ref={primary} onClick={() => window.location.reload()}>Reload flight</button>
        : <button className={styles.primary} ref={primary} disabled={!ready} onClick={() => enter(!paused)}>
          {!ready ? 'Preparing the flight…' : paused ? 'Resume flight' : ending ? 'Fly again' : 'Take wing'}
        </button>}
        <a href="/crossing/account">Story &amp; source</a>
      </div>
    </section>}
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{fault || paused ? '' : ending ? title + ' ' + warningWords[view.beat]
      : view.inReach ? 'Watcher in reach. Strike now.' : view.phase === 'strike' ? 'Intercepting the Watcher.' : warningWords[view.beat]}</span>
  </main>;
}

import type { PointerEvent } from 'react';
import { useRef } from 'react';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
import { useTrackpad } from './useTrackpad';
import { useTwinStick } from './useTwinStick';
import { useClassicThumbs } from './useClassicThumbs';
import TwinStickOverlay from './TwinStickOverlay';
import TouchCluster from './TouchCluster';
// The lazy touch layer (Experience loads it with next/dynamic; nothing here is on the landing first load). One full-screen
// surface: a mouse goes to the desktop trackpad/mouse handlers unchanged; touch and pen go to the chosen touch scheme.
// Both scheme hooks are always called (hook order), and only the active one renders or receives events.
export default function TouchControls() {
  const surface = useRef<HTMLDivElement>(null);
  const desktop = useTrackpad(surface);
  const paused = useGame(s => s.paused), trackpadFlying = useGame(s => s.trackpadFlying);
  const twinOn = useGame(s => s.touchScheme) === 'twin';
  const twin = useTwinStick(surface, twinOn);
  const classic = useClassicThumbs(surface);
  if (paused) return null;
  const scheme = twinOn ? twin : classic;
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      if (!scheme.busy()) desktop.start(e);
      return;
    }
    desktop.cancel();
    scheme.start(e);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') desktop.move(e); else scheme.move(e);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') desktop.end(e); else scheme.end(e);
  };
  const cancel = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') { scheme.cancel(e); return; }
    if (e.type === 'lostpointercapture') desktop.lostCapture(); else desktop.cancel();
  };
  const o = twin.overlay;
  return <>
    <div ref={surface} className={styles.flightSurface} aria-hidden="true" data-testid="flight-surface" data-play-surface=""
      data-scheme={twinOn ? 'twin' : 'classic'} data-control-mode="idle" data-fire-held="false" data-boost="false" data-cruise="false"
      data-layout={twinOn ? o.view?.layout.variant ?? 'normal' : 'classic'} data-trackpad-active={String(trackpadFlying)}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onPointerLeave={e => { if (e.pointerType === 'mouse') desktop.leave(); }} />
    {twinOn
      ? <TwinStickOverlay {...o}>{o.view && <TouchCluster layout={o.view.layout} onChange={twin.sync} onDescend={twin.cancelCruise} />}</TwinStickOverlay>
      : classic.overlay}
  </>;
}

import type { PointerEvent } from 'react';
import { useRef } from 'react';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
import { useTrackpad } from './useTrackpad';
import { useTwinStick } from './useTwinStick';
import { useTouchCapable } from './useTouchCapable';
import { touchCapable } from '@/game/pointerMode';
import { useClassicThumbs } from './useClassicThumbs';
import TwinStickOverlay from './TwinStickOverlay';
import TouchCluster from './TouchCluster';
// The lazy touch layer (Experience loads it with next/dynamic; nothing here is on the landing first load). One full-screen
// surface: a mouse goes to the desktop trackpad/mouse handlers unchanged; touch and pen go to the chosen touch scheme.
// Both scheme hooks are always called (hook order), and only the active one renders or receives events. On a device that has
// never shown touch (touchCapable false: a Mac with a trackpad) every pointer is desktop and no touch overlay renders at all.
export default function TouchControls() {
  const surface = useRef<HTMLDivElement>(null);
  const desktop = useTrackpad(surface);
  const paused = useGame(s => s.paused), trackpadFlying = useGame(s => s.trackpadFlying);
  const twinOn = useGame(s => s.touchScheme) === 'twin';
  const capable = useTouchCapable();
  const twin = useTwinStick(surface, twinOn && capable);
  const classic = useClassicThumbs(surface);
  if (paused) return null;
  const scheme = twinOn ? twin : classic;
  // Read live (not the rendered `capable`): the first real touch latches capability inside this same event, before React re-renders.
  const isDesktop = (e: PointerEvent<HTMLDivElement>) => e.pointerType === 'mouse' || !touchCapable();
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (isDesktop(e)) {
      if (!scheme.busy()) desktop.start(e);
      return;
    }
    desktop.cancel();
    scheme.start(e);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (isDesktop(e)) desktop.move(e); else scheme.move(e);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (isDesktop(e)) desktop.end(e); else scheme.end(e);
  };
  const cancel = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDesktop(e)) { scheme.cancel(e); return; }
    if (e.type === 'lostpointercapture') desktop.lostCapture(); else desktop.cancel();
  };
  const o = twin.overlay;
  return <>
    <div ref={surface} className={styles.flightSurface} aria-hidden="true" data-testid="flight-surface" data-play-surface=""
      data-scheme={twinOn ? 'twin' : 'classic'} data-control-mode="idle" data-fire-held="false" data-boost="false" data-cruise="false"
      data-layout={twinOn ? o.view?.layout.variant ?? 'normal' : 'classic'} data-trackpad-active={String(trackpadFlying)}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onPointerLeave={e => { if (isDesktop(e)) desktop.leave(); }} />
    {!capable ? null : twinOn
      ? <TwinStickOverlay {...o}>{o.view && <TouchCluster layout={o.view.layout} onChange={twin.sync} onDescend={twin.cancelCruise} />}</TwinStickOverlay>
      : classic.overlay}
  </>;
}

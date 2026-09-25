'use client';
import { useEffect, useRef, useState } from 'react';
import { resetGestureApply } from '@/game/gesture/applyGesture';
import { clearGesture, gesture } from '@/game/gesture/bus';
import type { ArbiterOut, GestureCtx, Scheme } from '@/game/gesture/types';
import { releaseFire } from '@/game/combat';
import type { Vec } from '@/game/motion';
import { touchMode } from '@/game/pointerMode';
import { releaseThumb, runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import Boundary from '../Boundary';
import GestureSurface from './GestureSurface';
import GhostGuide from './GhostGuide';
import HoldGuide, { createHoldModel, type HoldModel } from './HoldGuide';
import { setFallbackTarget, type LabScheme } from './LabFallback';
import { createProbe, flushLabStats, labStats, recordFrame, recordStroke, sampleProbe, type FrameProbe } from './labStats';
import { buildScheme, countLabOut, markTap } from './labWire';
import { ribbonLink, type RibbonPath } from './guideSteps';
import { instrumentScheme, strokeLog } from './strokeLog';
// The lazy Gesture Lab chunk entry (Experience loads it in place of TouchControls, keyed on the scheme, paused and inputEpoch).
// It builds the scheme, registers it on the bus, mounts the surface (which owns the ink canvas) and the guides, and samples
// local stats each frame. Unmount undoes every registration. A scheme that fails to build or render calls onError, so
// Experience falls back to 'standard'.
type Props = { scheme: LabScheme; onError?: (error: unknown) => void };
type Built = { scheme: Scheme; error: null } | { scheme: null; error: unknown };
const SAVE_MS = 10000;

function build(id: LabScheme): Built {
  try {
    const stats = labStats();
    const scheme = instrumentScheme(buildScheme(id), id, {
      log: strokeLog, now: () => performance.now(),
      stroke: (kind, ok, latency) => recordStroke(stats, id, kind, ok, latency),
    });
    return { scheme, error: null };
  } catch (error) { return { scheme: null, error }; }
}

function readProbe(p: FrameProbe) {
  const s = runtime.shooter;
  p.hits = s.stats.hits; p.kills = s.stats.kills; p.presses = s.input.pressSerial;
  p.gestureFire = s.input.fire && s.input.fireSource === 'gesture';
  p.locked = s.weapon.lock > 0; p.clearance = runtime.clearance.active; p.flying = useGame.getState().flying;
}

export default function LabControls({ scheme: id, onError }: Props) {
  const [built] = useState(() => build(id));
  const [failed, setFailed] = useState(false), [touch] = useState(touchMode), [hold] = useState<HoldModel>(createHoldModel);
  const reduced = useGame(st => st.reduced);
  const scheme = built.scheme, report = useRef(onError);
  useEffect(() => { report.current = onError; }, [onError]);

  // Registration: the bus, the look source, the fallback buttons. Cleanup restores all of it.
  useEffect(() => {
    if (!scheme) { report.current?.(built.error); return; }
    const s = runtime.shooter, previousLook = s.input.lookSource;
    const step = (dt: number, pos: Vec, ctx: GestureCtx) => scheme.step(dt, pos, ctx);
    resetGestureApply(); clearGesture(); releaseThumb();
    gesture.scheme = scheme.id; gesture.step = step; gesture.exemptHip = !useGame.getState().labShotsSlow;
    const ribbon = (scheme as Scheme & { ribbon?: RibbonPath }).ribbon ?? null;
    if (ribbon) ribbonLink.path = ribbon;
    s.input.lookSource = 'tap';
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* no pointer lock to leave */ }
    setFallbackTarget(scheme);
    return () => {
      setFallbackTarget(null);
      if (ribbon && ribbonLink.path === ribbon) ribbonLink.path = null;
      scheme.cancel(); scheme.reset();
      if (gesture.step === step) { gesture.step = null; gesture.scheme = 'off'; }
      s.input.lookSource = previousLook;
      releaseFire(s, 'gesture'); clearGesture(); releaseThumb(); resetGestureApply();
    };
  }, [scheme, built.error]);

  // Local stats: played time, frame times, speed and the probe edges, saved every 10 s and on unmount.
  useEffect(() => {
    if (!scheme) return;
    const stats = labStats(), prev = createProbe(), now = createProbe();
    readProbe(prev);
    let raf = 0, last = performance.now(), saveAt = last + SAVE_MS;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = t - last;
      last = t;
      if (useGame.getState().paused) return;
      recordFrame(stats, id, dt, runtime.speed);
      readProbe(now); sampleProbe(stats, id, prev, now);
      if (t > saveAt) { saveAt = t + SAVE_MS; flushLabStats(); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); flushLabStats(); };
  }, [scheme, id]);

  if (!scheme || failed) return null;
  const renderFailed = () => { setFailed(true); report.current?.(new Error(`Gesture Lab ${id} failed to render`)); };
  const onAction = (o: Readonly<ArbiterOut>) => { countLabOut(id, o); markTap(o); };
  return <Boundary fallback={null} onError={renderFailed}>
    <GestureSurface scheme={scheme} hold={hold} onAction={onAction} />
    <HoldGuide model={hold} scheme={id} />
    <GhostGuide scheme={id} touch={touch} reduced={reduced} />
  </Boundary>;
}

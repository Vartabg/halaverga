'use client';
// Ghost onboarding (spec 7): one ghost at a time, drawn at real speed (about 600 ms), looped twice, skippable, replaying after 8 s
// with no success. Touch: the right thumb zone above the bottom band; desktop: centre-right with the click-to-ink cue. Reduced
// motion: a static dotted path with arrowheads. The runner (guideSteps) holds all timing; this component only paints it, with a
// rAF only while a ghost animates and a timer while it waits for the next replay.
import { useEffect, useRef, useState } from 'react';
import { GUIDE_STEPS, createGhostFrame, createRunner, ghostAnchor, ghostFrame, guideLink, loadGuideProgress, progressToSave, saveGuideProgress,
  skip, type GhostShape, type LabScheme } from './guideSteps';

type Shape = { d: string; sx: number; sy: number; context?: string; pulse?: boolean };
const pts = (n: number, fn: (k: number) => [number, number]) => {
  let d = '';
  for (let i = 0; i <= n; i++) { const [x, y] = fn(i / n); d += (i ? 'L' : 'M') + x.toFixed(3) + ' ' + y.toFixed(3); }
  return d;
};
const ring = (r: number, cx = 0, cy = 0) => pts(32, k => [cx + r * Math.sin(k * 2 * Math.PI), cy + r * Math.cos(k * 2 * Math.PI)]);
/** Every ghost in a [-1, 1] box, y down. sx, sy is the start (the desktop click cue); context is a static prop (roof, drone). */
export const GHOST_SHAPES: Readonly<Record<GhostShape, Shape>> = {
  curve: { d: 'M-.8 .6C-.3 -.7 .3 .7 .8 -.6', sx: -.8, sy: .6 },
  chain: { d: 'M-.85 .55Q-.5 -.35 0 0M0 0Q.45 .35 .85 -.55', sx: -.85, sy: .55 },
  tap: { d: 'M0 0L.001 0', sx: 0, sy: 0, pulse: true, context: ring(.12) },
  rooftop: { d: 'M-.8 -.5Q.1 -.95 .55 .3', sx: -.8, sy: -.5, context: 'M.15 .42H.95M.15 .42V.9M.95 .42V.9' },
  rest: { d: 'M.35 -.1L.351 -.1', sx: .35, sy: -.1, pulse: true },
  stir: { d: pts(48, k => [-.55 + .9 * k + .28 * Math.cos(6 * Math.PI * k), .28 * Math.sin(6 * Math.PI * k)]), sx: -.27, sy: 0 },
  lift: { d: 'M0 .5L0 -.55', sx: 0, sy: .5 },
  flick: { d: 'M-.35 .25L.65 -.35', sx: -.35, sy: .25 },
  circle: { d: ring(.6), sx: 0, sy: .6 },
  up: { d: 'M0 .75L0 -.75', sx: 0, sy: .75 },
  turn: { d: 'M.1 0L.85 0M-.1 0L-.85 0', sx: .1, sy: 0 },
  down: { d: 'M0 -.75L0 .75', sx: 0, sy: -.75 },
  lasso: { d: ring(.62), sx: 0, sy: .62, context: ring(.14) },
};

const BOX = { position: 'fixed', pointerEvents: 'none', zIndex: 3, display: 'grid', justifyItems: 'center', gap: 6 } as const;
const LABEL = { font: '600 14px system-ui, sans-serif', color: '#fff', textShadow: '0 1px 3px #000c', whiteSpace: 'nowrap' } as const;
const SKIP = { pointerEvents: 'auto', minWidth: 44, minHeight: 44, padding: '0 14px', borderRadius: 22, border: '1px solid #ffffff66',
  background: '#0b1d24b3', color: '#fff', font: '600 13px system-ui, sans-serif' } as const;

export type GhostGuideProps = { scheme: LabScheme; touch: boolean; reduced: boolean; announce?: (text: string) => void };

export default function GhostGuide({ scheme, touch, reduced, announce }: GhostGuideProps) {
  const [runner] = useState(() => createRunner(scheme, loadGuideProgress()[scheme], performance.now()));
  const [shown, setShown] = useState<{ step: number; visible: boolean }>({ step: -1, visible: false });
  const [view, setView] = useState(() => ({ w: 390, h: 844 }));
  const trail = useRef<SVGPathElement>(null), tip = useRef<SVGCircleElement>(null), pulse = useRef<SVGCircleElement>(null);
  const length = useRef(1), say = useRef(announce);
  say.current = announce;
  useEffect(() => {
    const size = () => setView({ w: window.innerWidth, h: window.innerHeight });
    size(); window.addEventListener('resize', size);
    return () => window.removeEventListener('resize', size);
  }, []);
  useEffect(() => {
    const frame = createGhostFrame();
    let raf = 0, timer = 0, lastStep = -2, lastVisible = false;
    const paint = () => {
      raf = 0; timer = 0;
      ghostFrame(runner, performance.now(), reduced, frame);
      if (runner.dirty) { runner.dirty = false; saveGuideProgress(scheme, progressToSave(runner)); }
      if (runner.step !== lastStep || frame.visible !== lastVisible) {
        if (frame.visible && runner.step !== lastStep && frame.step) say.current?.(touch ? frame.step.label : frame.step.desk);
        lastStep = runner.step; lastVisible = frame.visible; setShown({ step: runner.step, visible: frame.visible });
      }
      const p = trail.current;
      if (p && frame.visible) {
        const L = length.current;
        p.style.strokeDashoffset = frame.dotted ? '0' : String(L * (1 - frame.progress));
        if (tip.current && !frame.dotted) {
          const at = p.getPointAtLength(L * frame.progress);
          tip.current.setAttribute('cx', String(at.x)); tip.current.setAttribute('cy', String(at.y));
        }
        if (pulse.current) {
          pulse.current.setAttribute('r', String(frame.dotted ? .4 : .15 + .45 * frame.progress));
          pulse.current.setAttribute('opacity', String(frame.dotted ? .8 : 1 - frame.progress));
        }
      }
      if (frame.wakeIn === 0) raf = requestAnimationFrame(paint);
      else if (Number.isFinite(frame.wakeIn)) timer = window.setTimeout(paint, Math.min(frame.wakeIn + 16, 60_000));
    };
    runner.wake = () => { if (timer) clearTimeout(timer); if (!raf) raf = requestAnimationFrame(paint); };
    guideLink.runner = runner;
    paint();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      runner.wake = null;
      if (guideLink.runner === runner) guideLink.runner = null;
    };
  }, [runner, scheme, reduced, touch]);
  const stepDef = shown.visible ? GUIDE_STEPS[scheme][shown.step] ?? null : null;
  useEffect(() => {
    const p = trail.current;
    if (!p) return;
    try { length.current = p.getTotalLength() || 1; } catch { length.current = 1; }
    if (!reduced) p.style.strokeDasharray = String(length.current);
  }, [stepDef?.shape, reduced]);
  if (!stepDef) return null;
  const shape = GHOST_SHAPES[stepDef.shape], box = ghostAnchor(touch, view.w, view.h, 0, { x: 0, y: 0, size: 0 });
  const style = { ...BOX, left: box.x - box.size / 2, top: box.y - box.size / 2,
    transform: touch ? 'translateY(calc(-1 * env(safe-area-inset-bottom, 0px)))' : undefined };
  return <div style={style} data-testid="lab-ghost" data-step={stepDef.id}>
    <svg aria-hidden="true" focusable="false" width={box.size} height={box.size} viewBox="-1.1 -1.1 2.2 2.2" overflow="visible">
      <defs><marker id="lab-ghost-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="#e8fbff" /></marker></defs>
      {shape.context && <path d={shape.context} fill="none" stroke="#ffffff80" strokeWidth={.05} />}
      <path key={stepDef.shape + String(reduced)} ref={trail} d={shape.d} fill="none" stroke="#e8fbff" strokeLinecap="round" strokeLinejoin="round"
        strokeWidth={reduced ? .05 : .09} strokeDasharray={reduced ? '.06 .1' : undefined} markerEnd={reduced ? 'url(#lab-ghost-arrow)' : undefined} />
      {shape.pulse && <circle ref={pulse} cx={shape.sx} cy={shape.sy} r={.15} fill="none" stroke="#e8fbff" strokeWidth={.05} />}
      {!touch && !shape.pulse && <circle cx={shape.sx} cy={shape.sy} r={.12} fill="none" stroke="#ffd166" strokeWidth={.05} />}
      {!reduced && !shape.pulse && <circle ref={tip} cx={shape.sx} cy={shape.sy} r={.1} fill="#e8fbff" />}
    </svg>
    <span style={LABEL}>{touch ? stepDef.label : stepDef.desk}</span>
    <button type="button" style={SKIP} onClick={() => skip(runner, performance.now())}>Skip tip</button>
  </div>;
}

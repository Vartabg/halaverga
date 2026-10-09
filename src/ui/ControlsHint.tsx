import { useEffect, useRef, useState } from 'react';
import { HINT_STEPS, persistGame, useGame, type HintSeries } from '@/game/store';
import { runtime } from '@/game/runtime';
import { LINE_MS, hintDone, hintText, hintTrack, nextStep, progressToSave, type HintObs } from './hintSteps';
import styles from './ShooterHud.module.css';
// One instruction at a time, in the band under the header, clear of the crosshair, the suit and the thumbs. The series tracks
// (touch, simple, mouse) advance when the player has done what the hint says, in any order (an action done before its hint
// skips that hint), and persist, so a finished step never repeats. A step that times out hides for this page load only and is
// never saved. The tap-pad, expert-profile and one-thumb (classic) lines show once per page load for 6 s. Observations are
// polled every 150 ms (plus at once on a pointer-lock change); state is set only when captured, step or text changes, never
// per frame. Touch reads runtime.stick's running counters (moves, climbs, lookTravel), which the twin controls keep.
const EVERY_MS = 150, MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF'];
let lineAt = -1;
/** This page load only: the series being observed, its first observation, captured look travel, the latched move and landing
 * flags, and flying at the last poll (a true → false change latches a landing). */
const trail = { series: null as HintSeries | null, since: null as HintObs | null, look: 0, yaw: 0, pitch: 0, moved: false,
  landed: false, wasFlying: false };
/** This page load only: the step each series has reached (at least the saved one), and the first step that timed out (-1 none). */
const session: Record<HintSeries, number> = { touch: 0, simple: 0, mouse: 0 };
const timedOut: Record<HintSeries, number> = { touch: -1, simple: -1, mouse: -1 };
const isLocked = () => typeof document !== 'undefined' && !!document.pointerLockElement;

export default function ControlsHint({ coarse }: { coarse: boolean }) {
  const shooter = useGame(s => s.shooter), tapControls = useGame(s => s.tapControls), desktopMode = useGame(s => s.desktopMode),
    steering = useGame(s => s.trackpadSteering), autoFire = useGame(s => s.autoFire), progress = useGame(s => s.hintProgress),
    scheme = useGame(s => s.touchScheme);
  const track = hintTrack({ shooter, coarse, tapControls, desktopMode, steering, scheme });
  const series = track === 'touch' || track === 'simple' || track === 'mouse' ? track : null;
  const [captured, setCaptured] = useState(isLocked), [said, setSaid] = useState(''), [, rerender] = useState(0);
  const step = series ? Math.max(progress[series], session[series]) : 0;
  const capRef = useRef(captured), shownAt = useRef(0);

  useEffect(() => {
    if (!series || step >= HINT_STEPS[series]) return;
    let done = false;
    const observe = (cap: boolean): HintObs => {
      const st = runtime.shooter.stats, stick = runtime.stick, flying = useGame.getState().flying;
      if (MOVE_KEYS.some(k => runtime.keys.has(k)) || (trail.since && flying !== trail.since.flying)) trail.moved = true;
      if (trail.since && trail.wasFlying && !flying) trail.landed = true;
      trail.wasFlying = flying;
      return { flying, captured: cap, look: trail.look, hits: st.hits, shots: st.shots, moved: trail.moved,
        moves: stick.moves, climbs: stick.climbs, touchLook: stick.lookTravel, landed: trail.landed };
    };
    if (trail.series !== series) {
      Object.assign(trail, { series, since: null, look: 0, yaw: runtime.yaw, pitch: runtime.pitch, moved: false, landed: false,
        wasFlying: useGame.getState().flying });
      trail.since = observe(isLocked());
    }
    shownAt.current = performance.now();
    const evaluate = () => {
      if (done) return;
      const cap = isLocked();
      if (cap !== capRef.current) { capRef.current = cap; setCaptured(cap); }
      // Paused (Esc, Flight settings): the step's clock stops, so a timeout means 20 s of play with the hint showing.
      if (useGame.getState().paused) { shownAt.current += EVERY_MS; return; }
      if (cap) trail.look += Math.abs(runtime.yaw - trail.yaw) + Math.abs(runtime.pitch - trail.pitch);
      trail.yaw = runtime.yaw; trail.pitch = runtime.pitch;
      const now = observe(cap), verdict = hintDone(series, step, now, trail.since!, (performance.now() - shownAt.current) / 1000, shooter);
      if (!verdict) return;
      done = true;
      if (verdict === 'timeout' && timedOut[series] < 0) timedOut[series] = step;
      session[series] = nextStep(series, step + 1, now, trail.since!, shooter);
      // Saved progress never passes a step that only timed out: that lesson shows again on the next visit.
      const save = progressToSave(session[series], timedOut[series]), p = useGame.getState().hintProgress;
      if (save > p[series]) { useGame.setState({ hintProgress: { ...p, [series]: save } }); persistGame(); }
      rerender(n => n + 1);
    };
    const id = setInterval(evaluate, EVERY_MS);
    document.addEventListener('pointerlockchange', evaluate);
    return () => { clearInterval(id); document.removeEventListener('pointerlockchange', evaluate); };
  }, [series, step, shooter]);

  useEffect(() => {
    if (series || track === 'none') return;
    const now = performance.now();
    if (lineAt < 0) lineAt = now;
    const left = lineAt + LINE_MS - now;
    if (left <= 0) return;
    const id = setTimeout(() => rerender(n => n + 1), left + 16);
    return () => clearTimeout(id);
  }, [series, track]);

  const lineGone = !series && lineAt >= 0 && performance.now() - lineAt >= LINE_MS;
  const text = lineGone ? null : hintText(track, step, { autoFire, captured, shooter });
  // Set after mount and on each change, so the live region exists empty first and the first hint is announced too. hintVisible
  // lets the sound notice and the one-finger panel stay quiet while a hint speaks (one message at a time).
  useEffect(() => { setSaid(text ?? ''); useGame.setState({ hintVisible: text !== null }); }, [text]);
  useEffect(() => () => useGame.setState({ hintVisible: false }), []);
  if (text === null) return null;
  return <>
    <p className={styles.hint} aria-hidden="true" data-testid="controls-hint" data-track={track} data-step={step}>{text}</p>
    <div className="sr-only" aria-live="polite" data-testid="hint-live">{said}</div>
  </>;
}

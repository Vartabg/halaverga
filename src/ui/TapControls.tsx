import { useEffect, useRef, useState } from 'react';
import { clearInput, look, runtime } from '@/game/runtime';
import { pressAim, pressFire, releaseFire } from '@/game/combat';
import { useGame } from '@/game/store';
import type { Intent } from '@/game/motion';
import styles from './Experience.module.css';
// Tap buttons own their look source (the capture listener skips this pad), so the tap aim-assist profile applies.
const tap = () => { runtime.shooter.input.lookSource = 'tap'; };
export default function TapControls() {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shooter = useGame(s => s.shooter);
  const [firing, setFiring] = useState(false), [aiming, setAiming] = useState(false);
  useEffect(() => () => {
    if (timeout.current) clearTimeout(timeout.current);
    runtime.tap = { forward: 0, strafe: 0, vertical: 0 };
    releaseFire(runtime.shooter, 'tap');
  }, []);
  // Tap fire stops by itself after 3 s or on overheat, and a pause or reset can drop Aim: re-sync the toggles.
  useEffect(() => {
    const id = setInterval(() => {
      const i = runtime.shooter.input;
      setFiring(i.fire && i.fireSource === 'tap'); setAiming(i.aimLatched);
    }, 200);
    return () => clearInterval(id);
  }, []);
  const nudge = (value: Partial<Intent>) => {
    if (timeout.current) clearTimeout(timeout.current);
    runtime.tap = { forward: 0, strafe: 0, vertical: 0, ...value };
    timeout.current = setTimeout(() => { runtime.tap = { forward: 0, strafe: 0, vertical: 0 }; }, 350);
  };
  const buttons: [string, string, () => void][] = [
    ['↶','Look left',() => look(-75,0)], ['↑','Move forward',() => nudge({ forward: 1 })],
    ['↷','Look right',() => look(75,0)], ['⇧','Rise',() => nudge({ vertical: 1 })],
    // Stop halts movement only: a latched Aim and the Fire toggle stay set for players who cannot drag.
    ['←','Move left',() => nudge({ strafe: -1 })], ['■','Stop movement',() => clearInput(true, true)],
    ['→','Move right',() => nudge({ strafe: 1 })], ['⇩','Descend',() => nudge({ vertical: -1 })],
    ['⌃','Look up',() => look(0,-75)], ['↓','Move backward',() => nudge({ forward: -1 })],
    ['⌄','Look down',() => look(0,75)],
  ];
  const fire = () => {
    tap(); const s = runtime.shooter;
    if (!useGame.getState().shooter) return;
    if (s.input.fire && s.input.fireSource === 'tap') { releaseFire(s, 'tap'); setFiring(false); return; }
    pressFire(s, 'tap'); s.input.tapFireUntil = s.clock + 3; setFiring(true);
  };
  const aim = () => {
    tap(); const s = runtime.shooter;
    if (!useGame.getState().shooter) return;
    pressAim(s, true); setAiming(s.input.aimLatched);
  };
  return <div className={styles.tapPad} role="group" aria-label="Tap flight controls">
    {buttons.map(([icon,label,action]) => <button key={label} aria-label={label} title={label} onClick={() => { tap(); action(); }}>{icon}</button>)}
    {shooter && <>
      {/* Distinct names: the hold-to-fire button beside the pad is also called Fire. */}
      <button aria-label="Fire toggle, stops after 3 seconds" title="Fire · stops after 3 seconds" aria-pressed={firing} onClick={fire}>◎</button>
      <button aria-label="Aim toggle" title="Aim" aria-pressed={aiming} onClick={aim}>⌖</button>
    </>}
  </div>;
}

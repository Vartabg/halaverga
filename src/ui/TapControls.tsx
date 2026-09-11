import { useEffect, useRef } from 'react';
import { clearInput, look, runtime } from '@/game/runtime';
import type { Intent } from '@/game/motion';
import styles from './Experience.module.css';
export default function TapControls() {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); runtime.tap = { forward: 0, strafe: 0, vertical: 0 }; }, []);
  const nudge = (value: Partial<Intent>) => {
    if (timeout.current) clearTimeout(timeout.current);
    runtime.tap = { forward: 0, strafe: 0, vertical: 0, ...value };
    timeout.current = setTimeout(() => { runtime.tap = { forward: 0, strafe: 0, vertical: 0 }; }, 350);
  };
  const buttons: [string, string, () => void][] = [
    ['↶','Look left',() => look(-75,0)], ['↑','Move forward',() => nudge({ forward: 1 })],
    ['↷','Look right',() => look(75,0)], ['⇧','Rise',() => nudge({ vertical: 1 })],
    ['←','Move left',() => nudge({ strafe: -1 })], ['■','Stop movement',() => clearInput(true)],
    ['→','Move right',() => nudge({ strafe: 1 })], ['⇩','Descend',() => nudge({ vertical: -1 })],
    ['⌃','Look up',() => look(0,-75)], ['↓','Move backward',() => nudge({ forward: -1 })],
    ['⌄','Look down',() => look(0,75)],
  ];
  return <div className={styles.tapPad} role="group" aria-label="Tap flight controls">
    {buttons.map(([icon,label,action]) => <button key={label} aria-label={label} title={label} onClick={action}>{icon}</button>)}
  </div>;
}

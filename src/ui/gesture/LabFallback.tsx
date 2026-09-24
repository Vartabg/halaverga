'use client';
import { useEffect, useState } from 'react';
import type { Action, Scheme } from '@/game/gesture/types';
import { useGame } from '@/game/store';
import styles from './Lab.module.css';
// Spec 9: every lab scheme keeps plain 44 px buttons under More controls, for anyone who cannot or would rather not draw.
// MoreControls lives in the settings panel, which opens while flight is paused and LabControls is unmounted, so a press made
// then waits here and runs on the scheme the next LabControls mounts (flight resumes with it). This file stays light: the
// panel chunk imports it, and it imports no lab module.
export type LabScheme = Scheme['id'];
export const LAB_ACTIONS: Record<LabScheme, readonly (readonly [Action, string])[]> = {
  draw: [['fly-to', 'Fly to where I tap'], ['brake', 'Brake']],
  conduct: [['faster', 'Faster'], ['slower', 'Slower'], ['dash', 'Dash'], ['roll-left', 'Roll left'], ['roll-right', 'Roll right'], ['brake', 'Brake']],
  brush: [['soar', 'Soar'], ['dive', 'Dive'], ['turn-left', 'Turn left'], ['turn-right', 'Turn right'], ['roll', 'Roll'],
    ['lock-burst', 'Lock and burst nearest drone'], ['brake', 'Brake']],
};

let target: Scheme | null = null, pending: Action | null = null, pendingFor: LabScheme | null = null;
/** LabControls registers its scheme on mount and passes null on unmount. A press waiting for this scheme runs now. */
export function setFallbackTarget(s: Scheme | null) {
  target = s;
  if (!s || !pending) return;
  const a = pending, ok = pendingFor === s.id;
  pending = pendingFor = null;
  if (ok) s.fallback(a);
}
/** Runs now when that scheme is mounted, otherwise on its next mount (the latest press wins). True when it ran now. */
export function runFallback(scheme: LabScheme, a: Action): boolean {
  if (target?.id === scheme) { pending = pendingFor = null; target.fallback(a); return true; }
  pending = a; pendingFor = scheme;
  return false;
}

export default function LabFallback({ scheme }: { scheme: LabScheme | 'standard' }) {
  const paused = useGame(s => s.paused);
  const [note, setNote] = useState('');
  useEffect(() => { if (!paused) setNote(''); }, [paused]);
  if (scheme === 'standard') return null;
  const press = (a: Action, label: string) => { setNote(runFallback(scheme, a) ? `${label}.` : `${label} when flight resumes.`); };
  return <div className={styles.fallback} role="group" aria-label="Lab actions" data-testid="lab-fallback">
    {LAB_ACTIONS[scheme].map(([a, label]) => <button key={a} type="button" onClick={() => press(a, label)}>{label}</button>)}
    <p className={styles.note} role="status">{note}</p>
  </div>;
}

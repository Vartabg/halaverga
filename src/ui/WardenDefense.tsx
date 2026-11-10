import { useEffect, useRef, type PointerEvent, type KeyboardEvent } from 'react';
import { runtime } from '@/game/runtime';
import { SHIELD } from '@/game/commands';
import { WA } from '@/game/banishState';
import styles from './BattleHud.module.css';
/** Requests existing movement/shield intent only. Release on phase changes, cancellation, focus loss and touch epoch resets. */
export default function WardenDefense({ move, turn }: { move: number; turn: number }) {
  const owned = useRef({ axis: '' as '' | 'forward' | 'strafe', value: 0, shield: false, epoch: runtime.touchEpoch });
  const release = () => {
    const o = owned.current;
    if (o.shield) runtime.shooter.input.shield &= ~SHIELD.button;
    if (o.axis && runtime.tap[o.axis] === o.value) runtime.tap[o.axis] = 0;
    o.axis = ''; o.value = 0; o.shield = false;
  };
  useEffect(() => {
    const id = setInterval(() => { if (owned.current.epoch !== runtime.touchEpoch) release(); }, 50);
    return () => { clearInterval(id); release(); };
  }, [move, turn]);
  const engage = (axis: '' | 'forward' | 'strafe', value: number) => {
    release(); Object.assign(owned.current, { axis, value, shield: !axis, epoch: runtime.touchEpoch });
    if (axis) runtime.tap[axis] = value; else runtime.shooter.input.shield |= SHIELD.button;
  };
  const input = (axis: '' | 'forward' | 'strafe', value = 0) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); engage(axis, value); },
    onPointerUp: release, onPointerCancel: release, onLostPointerCapture: release, onBlur: release,
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); runtime.keys.delete(e.code); if (!e.repeat) engage(axis, value); } },
    onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); runtime.keys.delete(e.code); release(); } },
  });
  return <div className={styles.defense}>
    {move === WA.rush ? [-1, 1].map(d => <button key={d} type="button" {...input('strafe', d)} aria-label={`Evade ${d < 0 ? 'left' : 'right'}`}>{d < 0 ? '← Evade' : 'Evade →'}</button>)
      : <><button type="button" {...input('')} aria-label="Raise shield">Hold shield</button>
        {move === WA.sweep && <button type="button" {...input('forward', -1)} aria-label="Retreat from cleave">Retreat ↓</button>}</>}
  </div>;
}

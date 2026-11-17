import { useEffect, useState } from 'react';
import { flightFeel } from '@/game/flightFeel';
import { runtime, clearInput } from '@/game/runtime';
import { useGame } from '@/game/store';
import { secondFingerTap } from './secondFingerTap';
import styles from './FlightFeel.module.css';
import PhoneFlight from './PhoneFlight';
import { useTouchCapable } from './useTouchCapable';
/** Standard controls: release to hover, with an explicit extra brake. No per-frame React state. */
export default function FlightFeel() {
  const flying = useGame(s => s.flying), paused = useGame(s => s.paused);
  const capable = useTouchCapable(), classic = useGame(s => s.touchScheme === 'classic');
  const phone = capable && classic;
  const [sample, setSample] = useState({ speed: 0, status: 'Hover' });
  const brake = () => { clearInput(); flightFeel.brake = true; flightFeel.serial++; };
  useEffect(() => {
    const id = setInterval(() => {
      if (useGame.getState().paused) return;
      flightFeel.speed = runtime.speed; flightFeel.vertical = runtime.velocity.y;
      flightFeel.status = runtime.speed < .5 ? 'Hover' : flightFeel.brake ? 'Braking' : runtime.speed < 3 ? 'Hover' : runtime.velocity.y < -4 ? 'Diving' : runtime.velocity.y > 4 ? 'Climbing' : 'Flying';
      const next = { speed: Math.round(runtime.speed), status: flightFeel.status };
      setSample(old => old.speed === next.speed && old.status === next.status ? old : next);
    }, 100);
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'KeyB' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || useGame.getState().paused || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)) return;
      e.preventDefault(); brake();
    };
    addEventListener('keydown', key); return () => { clearInterval(id); removeEventListener('keydown', key); };
  }, []);
  if ((!flying && !phone) || paused) return null;
  return <aside className={styles.panel} aria-label="Flight controls">
    {/* Buttons only: the speed line and the tip under them left the screen (Garo, 2026-11-17); the state stays as data. */}
    <div className={styles.actions} data-testid="momentum-readout" data-status={sample.status} data-speed={sample.speed}>{phone && <PhoneFlight />}
      <button type="button" onClick={brake} onPointerUp={secondFingerTap(brake)} aria-label="Brake to hover">Brake{!phone && <kbd>B</kbd>}</button></div>
  </aside>;
}

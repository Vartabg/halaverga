import { useEffect, useState } from 'react';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
export default function Telemetry() {
  const [sample, setSample] = useState({ altitude: 20, position: runtime.position.toArray(), speed: 0, yaw: runtime.yaw, pitch: runtime.pitch });
  const flying = useGame(s => s.flying), landing = useGame(s => s.landing);
  useEffect(() => { const interval = setInterval(() => setSample({ altitude: Math.round(runtime.altitude), position: runtime.position.toArray(), speed: runtime.speed, yaw: runtime.yaw, pitch: runtime.pitch }), 350); return () => clearInterval(interval); }, []);
  return <div className={styles.telemetry} data-testid="flight-telemetry" data-position={JSON.stringify(sample.position)} data-speed={sample.speed.toFixed(2)} data-flying={String(flying)} data-heading={sample.yaw.toFixed(3)} data-pitch={sample.pitch.toFixed(3)}><span>MERIDIAN <i>/</i> {landing ? 'APPROACH' : flying ? 'IN FLIGHT' : 'ON FOOT'}</span><span>{String(sample.altitude).padStart(3, '0')} <small>M ALT</small></span></div>;
}

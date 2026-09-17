import { useEffect, useState } from 'react';
import { presentation } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
export default function Telemetry() {
  const [sample, setSample] = useState({ altitude: 20, position: runtime.position.toArray(), speed: 0, renderedPosition: presentation.position.toArray(), lean: 0, cameraDistance: 0, yaw: runtime.yaw, pitch: runtime.pitch, suitYaw: presentation.yaw, viewYaw: presentation.viewYaw, suitPitch: presentation.pitch, viewPitch: presentation.viewPitch });
  const flying = useGame(s => s.flying), landing = useGame(s => s.landing);
  useEffect(() => { const interval = setInterval(() => setSample({ altitude: Math.round(runtime.altitude), position: runtime.position.toArray(), speed: runtime.speed, renderedPosition: presentation.position.toArray(), lean: presentation.lean, cameraDistance: runtime.cameraDistance, yaw: runtime.yaw, pitch: runtime.pitch, suitYaw: presentation.yaw, viewYaw: presentation.viewYaw, suitPitch: presentation.pitch, viewPitch: presentation.viewPitch }), 350); return () => clearInterval(interval); }, []);
  return <div className={styles.telemetry} data-testid="flight-telemetry" data-position={JSON.stringify(sample.position)} data-speed={sample.speed.toFixed(2)} data-flying={String(flying)} data-rendered-position={JSON.stringify(sample.renderedPosition)} data-lean={sample.lean.toFixed(3)} data-camera-distance={sample.cameraDistance.toFixed(3)} data-heading={sample.yaw.toFixed(3)} data-pitch={sample.pitch.toFixed(3)} data-suit-heading={sample.suitYaw.toFixed(3)} data-view-heading={sample.viewYaw.toFixed(3)} data-suit-pitch={sample.suitPitch.toFixed(3)} data-view-pitch={sample.viewPitch.toFixed(3)}><span>MERIDIAN <i>/</i> {landing ? 'APPROACH' : flying ? 'IN FLIGHT' : 'ON FOOT'}</span><span>{String(sample.altitude).padStart(3, '0')} <small>M ALT</small></span></div>;
}

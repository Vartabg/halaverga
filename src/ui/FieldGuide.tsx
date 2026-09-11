import record from '@/content/arrival.json';
import { persistGame, useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import Modal from './Modal';
import styles from './Experience.module.css';
export default function FieldGuide({ onClose }: { onClose: () => void }) {
  const discovered = useGame(s => s.discovered);
  return <Modal title="Field guide" onClose={onClose}>
    <p className={styles.eyebrow}>MERIDIAN · EARTH · 2113</p>
    <p>A fictional modern hillside city, eighty years after the catastrophe of 2033. A flooded boulevard divides the district. Broken concrete apartments and glass towers rise on both banks.</p>
    <h3>Your route</h3>
    <ol><li>Arrival terrace: your starting point, 20 metres above the water.</li><li>Flooded boulevard: fly forward and descend to skim the water.</li><li>Broken viaduct: pass through the opening in the elevated road.</li><li>Upper skyline: rise to the tall tower on your right and find a flat roof.</li></ol>
    <h3>Move naturally</h3>
    <p>On a phone, drag the lower-left area to move and the right side to look. Tap Lift, then steer toward where you want to go. Release movement to brake and hover. Surge toggles extra speed. Aim at a nearby flat surface until a landing ring appears, then tap Land.</p>
    <p>Keyboard: W/A/S/D move, arrow keys look, R/F rise and descend, Space lifts or lands, Shift toggles Surge. Click the world for mouse look. Escape pauses. E opens the terminal when nearby.</p>
    <p>For single-tap movement, enable “Show tap controls” in Flight settings. Each directional tap makes a short movement; Stop immediately holds your position. Separate buttons turn your view.</p>
    <h3>Explore through text</h3>
    <p>Current location: {runtime.location}. You can read the same terminal record here without navigating the 3D scene.</p>
    <button className={styles.secondary} onClick={() => { useGame.setState({ discovered: true }); persistGame(); }}>
      {discovered ? 'Record recovered' : 'Recover municipal record'}</button>
    {discovered && <article><p className={styles.eyebrow}>{record.kind}</p><h3>{record.title}</h3><p>{record.body}</p><p className={styles.muted}>{record.note}</p></article>}
  </Modal>;
}

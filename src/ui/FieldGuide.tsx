import record from '@/content/arrival.json';
import { persistGame, useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import Modal from './Modal';
import styles from './Experience.module.css';
import { BUILD_STAMP, DEPLOYMENT_URL } from './buildInfo';
export default function FieldGuide({ onClose }: { onClose: () => void }) {
  const discovered = useGame(s => s.discovered);
  return <Modal title="Field guide" onClose={onClose}>
    <p className={styles.eyebrow}>MERIDIAN · EARTH · 2113</p>
    <p>A fictional modern hillside city, eighty years after the catastrophe of 2033. A flooded boulevard divides the district. Broken concrete apartments and glass towers rise on both banks.</p>
    <h3>Your route</h3>
    <ol><li>Arrival terrace: your starting point, 20 metres above the water.</li><li>Flooded boulevard: fly forward and descend to skim the water.</li><li>Broken viaduct: pass through the opening in the elevated road.</li><li>Upper skyline: rise to the tall tower on your right and find a flat roof.</li></ol>
    <img className={styles.districtMap} src="/district-map.svg" width="450" height="336" alt="District map: 1 arrival terrace, 2 flooded boulevard, 3 viaduct opening, 4 tower roof. The line follows the exterior route; shaded footprints mark building interiors." />
    <p>The suit explores the exteriors of this district. Amber clearance markers mean slow down and steer around; a survey frame marks the district edge. The suit brakes before the edge and remains free to turn back. The ceiling is 105 metres. Ruined interiors are outside this expedition.</p>
    <h3>Move naturally</h3>
    <p>Recommended on a trackpad: click the open scene to lift into hover. Slide one finger to look, hold W/S to fly forward/backward and A/D to move sideways. Release the movement keys to hover. R/F rise and descend, Shift toggles Surge, and Space lifts or lands. Click once to stop and free the pointer for buttons. Escape pauses. You can also drag to look or use the arrow keys without capturing the pointer.</p>
    <p>No multi-finger gesture is needed. Two- and three-finger gestures can belong to the browser or operating system; scrolling never changes speed in this mode. Choose “One finger + keyboard” in Flight settings or <a href="/?trackpad=simple">try it here</a>. The classic scroll controls remain optional.</p>
    <p>With one thumb, hold an open part of the scene to lift and fly. Slide left or right to turn, up to climb, and down to descend. Drag farther to accelerate; bring your thumb back for a gentle cruise. Hold near a screen edge to keep turning. Release to brake and hover. A quick tap does not start flight.</p>
    <p>Add a second thumb anywhere in the open scene for two-thumb control. The controls recenter: the left thumb moves forward, backward and sideways; the right looks around. Push farther with the left thumb to fly faster. Aim upward or downward with the right thumb while moving forward to climb or descend. Center the left thumb to hover while looking around. Roles stay with each thumb until one lifts. Lift either thumb, then slide the remaining thumb to continue one-thumb flight.</p>
    <p>Aim at a nearby flat surface until a landing ring appears, release, then tap Land. The active flight surface owns touch gestures. Pause first to use browser pinch zoom, or zoom and select text here in the Field guide.</p>
    <p>Classic trackpad controls: click the open scene to lift and cruise. Move the pointer to steer; edge turns fade when movement stops. Scroll up with two fingers to accelerate, or down to slow; reverse this direction in Flight settings if preferred. Click again to brake and hover. While hovering, click and drag to look around without moving. Aim down at a nearby flat surface, then click Land when its ring appears. Moving onto a button or outside the scene stops free-cursor cruise.</p>
    <p>Compare A · Free cursor and B · Captured steering in Flight settings. Captured steering hides the pointer so you can turn continuously. Click to brake and release it before using the interface. Escape pauses, and the on-screen controls also work without a keyboard. Return to the arrival terrace to compare the same route. Expressive hero poses can be switched off independently.</p>
    <p>Flow trackpad preview: click the scene to lift into hover. Slide one finger to look freely, whether still or moving. Stroke forward with two fingers to build speed; stroke backward to slow all the way to hover. Press once to brake; releasing never restarts flight. Two-finger click releases your pointer for Land and other controls, and Escape pauses. Click the scene again to look, then make a fresh forward stroke to glide. Fine movement, scroll direction and a skippable introduction are in Flight settings.</p>
    <p><a href="/?trackpad=flow">Try Flow</a> · <a href="/?trackpad=free">Compare classic free cursor</a> · <a href="/?trackpad=captured">Compare classic captured steering</a></p>
    <p>Keyboard: W/A/S/D move, arrow keys look, R/F rise and descend, Space lifts or lands, Shift toggles Surge. For captured mouse look, choose “Mouse + keyboard” in Flight settings, then click the world. Escape pauses. E opens the terminal when nearby.</p>
    <p>For single-tap movement, enable “Show tap controls” in Flight settings. Each directional tap makes a short movement; Stop immediately holds your position. Separate buttons turn your view.</p>
    <h3>Suit blaster</h3>
    <p>Rogue security drones still patrol the district. Aiming slows you to a precise hover-strafe; firing alone keeps you flying at a capped speed. Mouse: once the mouse is captured, hold the left button to fire and the right button to aim. Trackpad and Flow: hold C to fire and Q to aim; clicks and scrolling keep their flight meanings. Touch: hold Fire and drag the same finger to aim, and hold the Fire drag near an edge to keep turning; your flight thumb becomes a move stick and keeps its speed. Aim toggles precision. Tap controls: Fire and Aim toggles; Fire stops after 3 seconds, and Stop halts movement only. The weapon overheats after long bursts; press Fire as the vent marker crosses the lit window to cool it at once. Turn the blaster off in Flight settings.</p>
    <p className={styles.muted}>Fiction: the drones and the suit blaster are invented for this study.</p>
    <h3>Explore through text</h3>
    <p>Current location: {runtime.location}. You can read the same terminal record here without navigating the 3D scene.</p>
    <button className={styles.secondary} onClick={() => { useGame.setState({ discovered: true }); persistGame(); }}>
      {discovered ? 'Record recovered' : 'Recover municipal record'}</button>
    {discovered && <article><p className={styles.eyebrow}>{record.kind}</p><h3>{record.title}</h3><p>{record.body}</p><p className={styles.muted}>{record.note}</p></article>}
    <h3>Playtest this build</h3>
    <p>Scan with a phone to open the deployed game there. The build stamp identifies this exact code; Flight settings downloads measurements carrying the same stamp.</p>
    <img className={styles.qrHandoff} src="/qr-deployment.svg" width="150" height="150" alt={`QR code that opens ${DEPLOYMENT_URL}`} />
    <p className={styles.muted}>Build {BUILD_STAMP} · <a href={DEPLOYMENT_URL}>{DEPLOYMENT_URL}</a></p>
  </Modal>;
}

import record from '@/content/arrival.json';
import { persistGame, useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import Modal from './Modal';
import styles from './Experience.module.css';
import { BUILD_STAMP, DEPLOYMENT_URL } from './buildInfo';
export default function FieldGuide({ onClose }: { onClose: () => void }) {
  const discovered = useGame(s => s.discovered), blaster = useGame(s => s.shooter);
  return <Modal title="Field guide" onClose={onClose}>
    <p className={styles.eyebrow}>MERIDIAN · EARTH · 2113</p>
    <p>A fictional modern hillside city, eighty years after the catastrophe of 2033. A flooded boulevard divides the district. Broken concrete apartments and glass towers rise on both banks.</p>
    <h3>Your route</h3>
    <ol><li>Arrival terrace: your starting point, 20 metres above the water.</li><li>Flooded boulevard: fly forward and descend to skim the water.</li><li>Broken viaduct: pass through the opening in the elevated road.</li><li>Upper skyline: rise to the tall tower on your right and find a flat roof.</li></ol>
    <img className={styles.districtMap} src="/district-map.svg" width="450" height="336" alt="District map: 1 arrival terrace, 2 flooded boulevard, 3 viaduct opening, 4 tower roof. The line follows the exterior route; shaded footprints mark building interiors." />
    <p>The suit explores the exteriors of this district. Amber clearance markers mean slow down and steer around; a survey frame marks the district edge. The suit brakes before the edge and remains free to turn back. The ceiling is 105 metres. Ruined interiors are outside this expedition.</p>
    <h3>Move naturally</h3>
    <p>Recommended on a trackpad (the default): click the open scene to lift and cruise, move the pointer to steer, hold near an edge to keep turning, and scroll with two fingers for speed. Click again to brake and hover. While hovering, click and drag to look around; aim at a nearby flat surface and click Land. With the blaster on, a click while stopped or on the ground fires at the centre reticle instead (dragging only looks), and Space starts flying — W too, once you are in the air. Space stops again. Blaster sound starts off; turn it on in Flight settings.</p>
    <p>Prefer keys? Choose “One finger + keyboard” in Flight settings or <a href="/?trackpad=simple">try it here</a>. It captures the pointer, slides to look and flies with WASD.</p>
    <p>Touch screens, two thumbs: put your left thumb down anywhere on the left side and a joystick appears under it; push to move, farther to go faster, and hold it straight up to boost. Double-tap there to cruise forward. Drag your right thumb anywhere on the right side to look. Rise lifts off and climbs; Descend drops, and holding it over flat ground lands. Flight stays level unless you turn on “Fly where I look”. Turn the phone sideways for the most room.</p>
    <p>Look speed, left-handed layout, control size and opacity, and a one-thumb classic scheme are under Touch controls in Flight settings. During play the page does not scroll or zoom, and switching away pauses the game. A back swipe asks before leaving, and your progress is saved. Pause first to pinch zoom, or zoom and select text here in the Field guide.</p>
    <p>Compare Free cursor and Captured steering in Flight settings. Captured steering hides the pointer so you can turn continuously. Click to brake and release it before using the interface. Escape pauses, and the on-screen controls also work without a keyboard. Return to the arrival terrace to compare the same route. Expressive hero poses can be switched off independently.</p>
    <p>Flow trackpad preview: click the scene to lift into hover. Slide one finger to look freely, whether still or moving. Stroke forward with two fingers to build speed; stroke backward to slow all the way to hover. Press once to brake; releasing never restarts flight. Two-finger click releases your pointer for Land and other controls, and Escape pauses. Click the scene again to look, then make a fresh forward stroke to glide. Fine movement, scroll direction and a skippable introduction are in Flight settings.</p>
    <p><a href="/?trackpad=flow">Try Flow</a> · <a href="/?trackpad=free">Compare classic free cursor</a> · <a href="/?trackpad=captured">Compare classic captured steering</a></p>
    <p>Keyboard: W/A/S/D move, arrow keys look, R/F rise and descend, Space lifts or lands, Shift toggles Surge.{blaster ? ' With the blaster on and the free cursor, Space (or W in the air) starts a cruise, Space stops it, and Space lands when a surface is in reach.' : ''} For captured mouse look, choose “Mouse + keyboard” in Flight settings, then click the world. Escape pauses. E opens the terminal when nearby.</p>
    <p>For single-tap movement, enable “Show tap controls”{blaster ? ' under More controls' : ''} in Flight settings. Each directional tap makes a short movement; Stop immediately holds your position. Separate buttons turn your view.</p>
    <h3>Suit blaster</h3>
    <p>Rogue security drones still patrol the district. Aiming slows you to a precise hover-strafe; firing alone keeps you flying at a capped speed. Mouse: once the mouse is captured, hold the left button to fire and the right button to aim. Trackpad (default): while stopped or on the ground, a click fires when you let go and dragging only looks; Space starts flying, and a click or Space while flying stops. Hold C to fire and Q to aim at any time. Touch: hold Fire and drag the same thumb to aim; tap Aim to switch precise aim on or off. With the auto-fire assist on, the suit also fires by itself when the crosshair rests on a drone. Tap controls: Fire and Aim toggles; Fire stops after 3 seconds, and Stop halts movement only. The weapon overheats after long bursts and cools by itself. Aim and tap controls are under More controls in Flight settings. Turn the blaster off in Flight settings.</p>
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

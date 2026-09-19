// Frame strips of the authored flight clips on the actual rig: the real presentation, pose, animation and flight modules simulated
// at 60 Hz in system Chrome, chase rows at the game's field of view. `node scripts/review-flight-motion.mjs` needs no server.
// SUIT_FLIGHT_CLIPS=0 renders the same strips without the clip layer (the A/B baseline); SUIT_HERO=0 uses classic poses;
// SUIT_REDUCED=1 turns on reduced camera motion; SUIT_REVIEW_PHONE=1 renders chase tiles as whole landscape phone frames (852 x 393,
// shown at half size) instead of 2x crops of the 1440 x 1000 desktop frame;
// SUIT_FLIGHT_VIEW=chase renders every row from the chase camera (the owner's view); SUIT_FLIGHT_OUTPUT sets the PNG path;
// SUIT_FLIGHT_ROWS=0,6 picks rows; SUIT_REVIEW_SCALE=2.5 screenshots at that device pixel ratio.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const root = fileURLToPath(new URL('..', import.meta.url)), env = process.env;
const phone = env.SUIT_REVIEW_PHONE === '1', W = phone ? 426 : 170, H = phone ? 197 : 200, COLS = phone ? 4 : 8;
const options = { clips: env.SUIT_FLIGHT_CLIPS !== '0', hero: env.SUIT_HERO === '0' ? 0 : 1, reduced: env.SUIT_REDUCED === '1', cols: COLS, chase: env.SUIT_FLIGHT_VIEW === 'chase' };
const picked = env.SUIT_FLIGHT_ROWS?.split(',').map(s => s.trim());
if (picked && (picked.some(s => !/^[0-9]$/.test(s)) || new Set(picked).size !== picked.length)) throw new Error('SUIT_FLIGHT_ROWS must list distinct row numbers 0-9.');
const rows = picked?.map(Number) ?? null;
const page = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#12262c;color:#d7e9e3;font:12px Arial}
#wrap{display:flex}#labels{width:190px}#labels div{height:${H}px;box-sizing:border-box;padding:14px 12px;border-bottom:1px solid #1d3a41;letter-spacing:1px}
#labels small{display:block;color:#8fb3ad;margin-top:6px;line-height:1.4}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three/three.module.js","three/addons/":"/three/addons/"}}</script></head>
<body><div id="wrap"><div id="labels"></div><div id="stage"></div></div><script type="module">
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildSuitRig } from '/src/world/suitRig';
import { advanceSuitMotion, applySuitPose, orientSuit } from '/src/world/suitPose';
import { advanceFlightPose, CHASE_BOOM } from '/src/game/presentation';
import { advanceVelocity } from '/src/game/motion';
import { advanceSuitAnimation, applySuitAnimation, createSuitAnimation } from '/src/world/suitAnimation';
import { advanceFlightMix, createFlightMix } from '/src/world/flightMix';
import { applyFlightClips } from '/src/world/flightPose';
const W = ${W}, H = ${H}, O = ${JSON.stringify(options)}, PICK = ${JSON.stringify(rows)}, COLS = O.cols, PHONE = ${phone};
const FRAME = PHONE ? [852, 393] : [1440, 1000];
// Rows are authored for eight columns; the phone layout keeps every other one.
const spread = (from, to) => Array.from({ length: 8 }, (_, i) => from + i * (to - from) / 8);
const pickCols = list => list.filter((_, i) => i % (8 / COLS) === 0);
// Keyboard flight: forward (and surge) through the game's own velocity model, turning the view at 1.5 rad/s when asked.
const keys = ({ surge = t => false, forward = t => 1, turn = t => 0, pitch = t => 0 } = {}) => (sim, dt) => {
  sim.flying = true; sim.yaw += turn(sim.t) * dt; sim.pitch = pitch(sim.t);
  sim.velocity = advanceVelocity(sim.velocity, { forward: forward(sim.t), strafe: 0, vertical: 0 }, sim.yaw, sim.pitch, true, surge(sim.t), dt); };
const steady = speed => sim => { sim.flying = true; sim.velocity = { x: 0, y: 0, z: -speed }; };
const all = [
  ['Hover', 'chase · one bob', 'chase', 2, spread(0, 1 / .42), steady(0)],
  ['Cruise 8 m/s', 'side · trackpad cruise', 'side', 3, spread(0, 2), steady(8)],
  ['Cruise 13 m/s', 'side · keyboard flight', 'side', 3, spread(0, 2), keys()],
  ['Fist deploy', 'side · 0-.6 s after passing 20 m/s', 'side', 3, [], keys({ surge: t => t >= 0 }), [0, .08, .16, .24, .32, .4, .5, .6], (sim, p) => p.speed >= 20],
  ['Power hero', 'chase · surge 34 m/s', 'chase', 3, spread(0, 1), keys({ surge: () => true }), null, null, 1],
  ['Power classic', 'chase · surge, classic poses', 'chase', 3, spread(0, 1), keys({ surge: () => true }), null, null, 0],
  ['Left turn', 'chase · keyboard at 13 m/s, 0-1.2 s', 'chase', 2.5, [0, .15, .3, .45, .6, .8, 1, 1.2], keys({ turn: t => t >= 0 ? 1.5 : 0 })],
  ['Climb · dive', 'chase · camera below, then above', 'chase', 2, [-1.2, -.8, -.4, -.05, 1.3, 1.7, 2.1, 2.5], keys({ pitch: t => t < 0 ? .9 : -.9 })],
  ['Brake', 'side · release at 34 m/s', 'side', 3, [-.1, .05, .1, .2, .3, .45, .7, 1], keys({ surge: () => true, forward: t => t < 0 ? 1 : 0 })],
  ['Takeoff · touchdown', 'side · lift at 0 s, approach, touchdown', 'side', .5, [.03, .1, .25, .6], (sim, dt) => {
    const t = sim.t; sim.pinned = t >= 1.2; sim.landing = t >= 1.2 && sim.anchorY > 0;
    if (t < 1.2) { sim.flying = t >= 0; sim.velocity = { x: 0, y: t < 0 ? 0 : t < .4 ? 6 : 6 * Math.exp(-9 * (t - .4)), z: 0 }; }
    else { sim.anchorY = Math.max(0, sim.anchorY - 1.5 * dt); sim.flying = sim.anchorY > 0; sim.velocity = { x: 0, y: sim.flying ? -1.5 : 0, z: 0 }; } },
    [-.1, .02, .12, .35], (sim) => sim.t > 1.2 && !sim.flying],
].filter((_, i) => !PICK || PICK.includes(i));
// Each row's tag names the hero value that row actually renders with.
const tag = hero => [O.clips ? '' : 'without clips', hero ? '' : 'classic', O.reduced ? 'reduced' : ''].filter(Boolean).join(' · ');
for (const [name, note, , , , , , , heroOverride] of all) { const t = tag(heroOverride ?? O.hero), shown = O.chase ? note.replace(/^side/, 'chase') : note;
  document.getElementById('labels').insertAdjacentHTML('beforeend', '<div>' + name.toUpperCase() + '<small>' + shown + (t ? ' · ' + t : '') + '</small></div>'); }
const asset = await new GLTFLoader().loadAsync('/models/suit.glb');
const renderer = new T.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.max(${phone ? 2 : 1.5}, window.devicePixelRatio)); renderer.setSize(W * COLS, H * all.length);
renderer.setScissorTest(true); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.setClearColor('#12262c');
document.getElementById('stage').append(renderer.domElement);
const scene = new T.Scene(), rig = buildSuitRig(asset.scene), grid = new T.GridHelper(40, 80, '#5f8a86', '#35575a'); scene.add(rig.root, grid);
scene.add(new T.HemisphereLight('#c0d7eb', '#475b5e', 2.2));
for (const [color, intensity, pos] of [['#fff0d0', 3, [-3, 5, -3]], ['#92d5dd', 2, [4, 2, 3]]]) { const l = new T.DirectionalLight(color, intensity); l.position.set(...pos); scene.add(l); }
const camera = new T.PerspectiveCamera(30, W / H, .05, 80);
all.forEach(([, , side, warmup, times, drive, eventTimes, event, heroOverride], row) => {
  const hero = heroOverride ?? O.hero, shots = [...pickCols(times).map(t => ({ t, rel: false })), ...(eventTimes ? pickCols(eventTimes) : []).map(t => ({ t, rel: true }))];
  // Two passes: the first finds the event time, so a column before the event (the approach before touchdown) renders before it.
  const view = O.chase ? 'chase' : side; let mark = null;
  for (const render of event ? [false, true] : [true]) {
    const motion = { hero, epoch: 0 }, anim = createSuitAnimation(), mix = createFlightMix(), dt = 1 / 60;
    const pose = { viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, lean: 0, bank: 0, speed: 0, flight: 0, power: 0, brake: 0, epoch: 0, position: { x: 0, y: 0, z: 0 } };
    const sim = { t: -warmup, yaw: 0, pitch: 0, flying: false, landing: false, velocity: { x: 0, y: 0, z: 0 }, anchorX: 0, anchorY: 0, anchorZ: 0 };
    drive(sim, 0); pose.flight = sim.flying ? 1 : 0;
    for (let next = 0, guard = 0; (render ? next < shots.length : mark === null) && guard < 60 * 30; guard++) {
      drive(sim, dt); const v = sim.velocity;
      sim.anchorX += v.x * dt; sim.anchorZ += v.z * dt; if (!sim.pinned) sim.anchorY += v.y * dt; pose.position.y = sim.anchorY;
      const input = { flying: sim.flying, landing: sim.landing, paused: false, reduced: O.reduced, velocity: v };
      advanceFlightPose(pose, { yaw: sim.yaw, pitch: sim.pitch, speed: Math.hypot(v.x, v.y, v.z), velocity: v, flying: sim.flying, reduced: O.reduced }, dt);
      advanceSuitMotion(motion, hero > .5, dt); advanceSuitAnimation(anim, pose, input, dt); advanceFlightMix(mix, pose, input, dt); sim.t += dt;
      if (!render) { if (event(sim, pose)) mark = sim.t; continue; }
      // Pose every frame, as the game does: the living layer consumes its touchdown plant blend on the frame it happens.
      rig.root.position.set(0, 0, 0); orientSuit(rig.root, pose, motion); applySuitPose(rig.joints, pose, motion, O.reduced);
      const authored = O.clips ? applyFlightClips(rig.joints, mix, pose, anim, motion.hero, O.reduced) : 0;
      rig.root.position.y = applySuitAnimation(rig.joints, anim, pose, O.reduced, motion.hero, authored);
      const shot = shots[next], at = shot.rel ? (mark === null ? -Infinity : sim.t - mark) : sim.t;
      if (at < shot.t - 1e-9) continue;
      // Every column shows the instant its label names, to within a frame.
      if (at - shot.t > dt + 1e-9) throw new Error('row ' + row + ' column ' + next + ': ' + (shot.rel ? 'event ' : 'time ') + shot.t + ' rendered at ' + at.toFixed(3));
      grid.position.set(-(sim.anchorX % .5), -1.04 - sim.anchorY, -(sim.anchorZ % .5));
      camera.clearViewOffset();
      if (view === 'chase') {
        // The game's chase framing: boom in the view frame from the head, looking along the view, at the game's field of view. On a
        // desktop the tile is a crop of the 1440 x 1000 test viewport around the chest, so the perspective is exactly the game's.
        const q = new T.Quaternion().setFromEuler(new T.Euler(pose.viewPitch, pose.viewYaw, 0, 'YXZ'));
        camera.fov = O.reduced ? 65 : 65 + Math.min(pose.speed / 17, 2); camera.aspect = FRAME[0] / FRAME[1];
        camera.position.copy(CHASE_BOOM).applyQuaternion(q).add(new T.Vector3(0, .65, 0)); camera.quaternion.copy(q); camera.updateProjectionMatrix();
        if (!PHONE) {
          rig.root.updateMatrixWorld(true); camera.updateMatrixWorld(); const c = rig.joints[11].getWorldPosition(new T.Vector3()).project(camera);
          const x = (c.x + 1) / 2 * FRAME[0], y = (1 - c.y) / 2 * FRAME[1];
          camera.setViewOffset(FRAME[0], FRAME[1], x - W, y - H * .9, W * 2, H * 2);
        }
      } else { camera.fov = 30; camera.aspect = W / H; camera.position.set(4.6, .1, 0); camera.lookAt(0, -.05, 0); }
      camera.updateProjectionMatrix();
      const y = (all.length - 1 - row) * H; renderer.setViewport(next * W, y, W, H); renderer.setScissor(next * W, y, W, H);
      renderer.render(scene, camera); next++;
    }
  }
});
window.rendered = true;
</script></body></html>`;
const three = { 'three.module.js': 'build/three.module.js', 'three.core.js': 'build/three.core.js' };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
try {
  const tab = await browser.newPage({ viewport: { width: 190 + W * COLS, height: H * (rows?.length ?? 10) }, deviceScaleFactor: Number(env.SUIT_REVIEW_SCALE) || 1 });
  let fail; const failed = new Promise((_, reject) => { fail = reject; }); failed.catch(() => {});
  tab.on('pageerror', e => fail(e)); tab.on('console', m => { if (m.type() === 'error') fail(new Error(m.text())); });
  tab.on('requestfailed', r => fail(new Error(`Request failed: ${r.url()}`)));
  await tab.route('http://flight-motion.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: page });
    if (path === '/models/suit.glb') return route.fulfill({ contentType: 'model/gltf-binary', body: await readFile(root + 'public/models/suit.glb') });
    if (path.startsWith('/three/addons/')) return route.fulfill({ contentType: 'text/javascript', body: await readFile(root + 'node_modules/three/examples/jsm/' + path.slice(14)) });
    if (path.startsWith('/three/') && three[path.slice(7)]) return route.fulfill({ contentType: 'text/javascript', body: await readFile(root + 'node_modules/three/' + three[path.slice(7)]) });
    if (!/^\/src\/(world|game)\/[A-Za-z]+$/.test(path)) return route.abort();
    const source = await readFile(root + path.slice(1) + '.ts', 'utf8');
    return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText });
  });
  await tab.goto('http://flight-motion.test/');
  await Promise.race([tab.waitForFunction(() => window.rendered, null, { timeout: 90000 }), failed]);
  await tab.screenshot({ path: env.SUIT_FLIGHT_OUTPUT || '/tmp/halaverga-flight-motion.png', fullPage: true });
} finally { await browser.close(); }

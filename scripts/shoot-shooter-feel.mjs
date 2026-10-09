// Evidence frames for the shooting experience: a shot in flight, a damaged drone and a kill burst, from a running production server.
// Usage: node scripts/shoot-shooter-feel.mjs <base url> <out dir> <tag>   (tag: before | after)
// System Chrome, desktop emulation at 1440x1000 and 844x390 (the short-screen camera applies by CSS height): not an iPhone.
// The shooter clock stops while paused (Escape), so each frame is captured with the clock frozen a fixed wall-clock delay after the
// trigger key (+- one frame and the pause key's latency; the measured delay is printed and written next to the image). The HUD's
// data-* stamps (every 100 ms) report hits and kills. Seeds: the game's own (drone sim 2033, effects 0x1a2b3c): the same build
// gives the same burst for the same drone and clock.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base, out, tag] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node shoot-shooter-feel.mjs <base url> <out dir> <tag>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const VIEWS = [{ name: '1440x1000', width: 1440, height: 1000 }, { name: '844x390', width: 844, height: 390 }];
const SAVE = { muted: true, aimAssist: 1.5, shooter: true, controlsVersion: 6, desktopMode: 'trackpad', trackpadSteering: 'free', hintProgress: 99 };
const HIDE = '[class*=pauseCard],[class*=vignette]{visibility:hidden!important}';
const hud = page => page.getByTestId('shooter-hud');
const stat = async (page, k) => Number(await hud(page).getAttribute('data-' + k));
const acquired = async page => (await hud(page).getAttribute('data-acquired')) === 'true';
/** Drone eyes (saturated red blobs) in a screenshot, CSS px, biggest first (tests/lab-browser.ts). */
async function drones(page) {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height, seen = new Uint8Array(W * H), res = [];
    const red = i => d[i * 4] > 190 && d[i * 4 + 1] < 110 && d[i * 4 + 2] < 100 && d[i * 4] - d[i * 4 + 1] > 120;
    for (let p = 0; p < W * H; p++) {
      if (seen[p] || !red(p)) continue;
      let n = 0, sx = 0, sy = 0; const stack = [p]; seen[p] = 1;
      while (stack.length) {
        const q = stack.pop(), x = q % W, y = (q / W) | 0; n++; sx += x; sy += y;
        for (const r of [q - 1, q + 1, q - W, q + W]) if (r >= 0 && r < W * H && !seen[r] && Math.abs((r % W) - x) <= 1 && red(r)) { seen[r] = 1; stack.push(r); }
      }
      if (n >= 6) res.push({ x: sx / n * innerWidth / W, y: sy / n * innerHeight / H, n });
    }
    return res.sort((a, b) => b.n - a.n);
  }, png);
}
/** Turns the view with the arrow keys until the crosshair acquires a drone (closed loop on the nearest eye). */
async function aimAtDrone(page, budgetMs = 25000) {
  const v = page.viewportSize(), cx = v.width / 2, cy = v.height / 2, t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    if (await acquired(page)) return true;
    const all = (await drones(page)).filter(d => d.n >= 6 && d.y > 70);
    if (!all.length) { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.up('ArrowRight'); continue; }
    const d = all.reduce((a, b) => Math.hypot(a.x - cx, a.y - cy) <= Math.hypot(b.x - cx, b.y - cy) ? a : b);
    const dx = d.x - cx, dy = d.y - cy;
    const axis = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
    const px = Math.max(Math.abs(dx), Math.abs(dy));
    await page.keyboard.down(axis); await page.waitForTimeout(Math.min(400, Math.max(30, px * 1.2))); await page.keyboard.up(axis);
    await page.waitForTimeout(120);
  }
  return acquired(page);
}
/** Key events dispatched inside the page (bubbling from body to window), so their timing is the page's own, not the driver's. */
const KEYS = `const key = (type, code) => document.body.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));`;
/** One trigger tap (C): down now, up 25 ms later. Returns the page time of the key-down. */
const tap = page => page.evaluate(`(() => { ${KEYS} const t = performance.now(); key('keydown', 'KeyC'); setTimeout(() => key('keyup', 'KeyC'), 25); return t; })()`);
/** Trigger, then Escape (pause) exactly `delayMs` later, on the page's own clock; resolves with the measured delay. */
const tapThenFreeze = (page, delayMs) => page.evaluate(`new Promise(res => { ${KEYS} const t = performance.now(); key('keydown', 'KeyC'); setTimeout(() => key('keyup', 'KeyC'), 25);
  setTimeout(() => { key('keydown', 'Escape'); key('keyup', 'Escape'); res(performance.now() - t); }, ${delayMs}); })`);
/** Freezes the clock `delayMs` after page time `from`, hides the card, saves the frame, resumes. Returns the measured delay. */
async function frozen(page, from, delayMs, path) {
  const at = await page.evaluate(`new Promise(res => { ${KEYS} const wait = Math.max(0, ${from} + ${delayMs} - performance.now());
    setTimeout(() => { key('keydown', 'Escape'); key('keyup', 'Escape'); res(performance.now() - ${from}); }, wait); })`);
  await settleFrozen(page, path); return at;
}
async function settleFrozen(page, path) {
  await page.locator('button:has-text("Resume flight")').waitFor({ state: 'attached', timeout: 8000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path, type: 'jpeg', quality: 72 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Resume flight'))?.click());
  await page.getByRole('button', { name: 'Pause expedition' }).waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(120);
}
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const watchdog = setTimeout(() => { console.error('watchdog: 420 s, giving up'); process.exit(3); }, 420000);
const log = {};
try {
  for (const v of VIEWS) {
    const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(s => { localStorage.setItem('halaverga-flight-v1', JSON.stringify(s)); }, SAVE);
    await page.goto(base + '/?shooter=1', { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: HIDE });
    await page.getByRole('button', { name: 'Begin expedition' }).click();
    await page.getByRole('button', { name: 'Pause expedition' }).waitFor({ state: 'visible', timeout: 30000 });
    await hud(page).waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=shooter-hud]')?.getAttribute('data-cannon') === 'shown', null, { timeout: 20000 }).catch(() => {});
    await page.locator('main').focus();
    await page.keyboard.down('KeyQ'); await page.waitForTimeout(400);
    const entry = log[v.name] = { acquired: await aimAtDrone(page) };
    // 1. The shot: trigger, then freeze 30 ms later (flash and lance, tracer in flight, cannon kick), within one frame.
    entry.shotMs = await tapThenFreeze(page, 30); await settleFrozen(page, `${out}/${tag}-shot-${v.name}.jpg`);
    // 2. Damage: hits until one drone is down to 2 HP or less (failing: plate gone, glow, smoke, wobble), then freeze 350 ms after the last hit.
    // data-hp is new (2026-10-07); on an older build the frame is taken after four hits instead.
    const lowest = async () => { const hp = await hud(page).getAttribute('data-hp'); return hp ? Math.min(...hp.split(',').map(Number).filter(h => h > 0)) : (await stat(page, 'hits')) >= 4 ? 0 : 6; };
    let kills = await stat(page, 'kills'), last = 0, guard = 0;
    while ((await lowest()) > 2 && (await stat(page, 'kills')) === kills && guard++ < 40) {
      if (!(await acquired(page))) await aimAtDrone(page, 8000);
      last = await tap(page); await page.waitForTimeout(170);
    }
    entry.hitsAtDamaged = await stat(page, 'hits'); entry.hpAtDamaged = await hud(page).getAttribute('data-hp'); entry.killsAtDamaged = await stat(page, 'kills');
    entry.damagedMs = await frozen(page, last, 350, `${out}/${tag}-damaged-${v.name}.jpg`);
    // 3. The kill: keep hitting until kills increments; freeze at about 160 ms (the burst) and again near 700 ms (debris and smoke).
    guard = 0;
    while ((await stat(page, 'kills')) === kills && guard++ < 60) {
      if (!(await acquired(page))) await aimAtDrone(page, 8000);
      last = await tap(page); await page.waitForTimeout(170);
    }
    entry.killed = (await stat(page, 'kills')) > kills;
    entry.burstMs = await frozen(page, last, 160, `${out}/${tag}-kill-burst-${v.name}.jpg`);
    const resumed = await page.evaluate('performance.now()');
    entry.afterMs = entry.burstMs + await frozen(page, resumed, 520, `${out}/${tag}-kill-after-${v.name}.jpg`);
    await page.keyboard.up('KeyQ');
    console.log(`${tag} ${v.name}: ${JSON.stringify(entry)}`);
    await context.close();
  }
  writeFileSync(`${out}/${tag}-timing.json`, JSON.stringify(log, null, 2));
} finally { clearTimeout(watchdog); await browser.close(); }

import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { CONTROL_TYPES, type ControlId } from '../src/game/controlTypes';
// Shared helpers for the Gesture Lab browser specs (lab-*.spec.ts). System Chrome emulation: these check the wiring and the
// behaviour a player can see, never how Draw, Conduct or Brush feel on a real iPhone or Mac trackpad (docs/gesture-lab.md).
export type Lab = 'standard' | 'draw' | 'conduct' | 'brush';
/** Any way to fly: the legacy 'standard' or one of the ten registry ids. */
export type AnyControl = Lab | ControlId;
const isLab = (id: string): id is Exclude<Lab, 'standard'> => id === 'draw' || id === 'conduct' || id === 'brush';
export type Pt = { x: number; y: number };
export type Tel = { pos: number[]; speed: number; flying: boolean; heading: number; pitch: number };
/** A mouse click, or a tap on a touch page (a mouse click on a touch page would flip the control family). */
export const press = (l: Locator, touch = false) => touch ? l.tap() : l.click();
export const pauseCard = (page: Page) => page.getByRole('region', { name: 'Expedition paused' });
export const flightSettings = (page: Page) => page.getByRole('dialog', { name: 'Flight settings' });
export const controlsSheet = (page: Page) => page.getByTestId('controls-sheet');
/**
 * Flight settings. The gear left the top row: Pause, then the pause card's Flight settings row. The dialog is open on return and the game
 * stays paused; closing it shows the pause card again (Resume is the player's own tap: shooter-browser's `resume`).
 */
export async function openSettings(page: Page, touch = false) {
  if (!(await pauseCard(page).isVisible())) await press(page.getByRole('button', { name: 'Pause expedition' }), touch);
  await press(pauseCard(page).getByRole('button', { name: 'Flight settings', exact: true }), touch);
  await expect(page.getByRole('dialog', { name: 'Flight settings' })).toBeVisible();
}
/** The Field guide, the same way: Pause (unless the pause card is already up), then the pause card's Field guide row. */
export async function openGuide(page: Page, touch = false) {
  if (!(await pauseCard(page).isVisible())) await press(page.getByRole('button', { name: 'Pause expedition' }), touch);
  await press(pauseCard(page).getByRole('button', { name: 'Field guide', exact: true }), touch);
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Field guide' })).toBeVisible({ timeout: 15000 });
}
/**
 * Flight settings' Controls row names the control in use (the list of every way to fly lives only in the Controls sheet): its id.
 * Reads the open dialog's row; the row's accessible name is `Controls: <label>`, the same words as the top row's button.
 */
export async function settingsCurrent(page: Page): Promise<ControlId> {
  const name = (await flightSettings(page).getByTestId('controls-row').getAttribute('aria-label'))!.replace(/^Controls: /, '');
  return CONTROL_TYPES.find(c => c.label === name)!.id;
}
/**
 * Opens the Controls sheet through whichever door the screen has: Flight settings' Controls row (the dialog closes as the sheet opens),
 * the pause card's Controls row, or the top row's Controls button while playing. The game stays as it was (paused stays paused).
 */
export async function openControls(page: Page, touch = false) {
  const door = (await flightSettings(page).isVisible()) ? flightSettings(page).getByTestId('controls-row')
    : (await pauseCard(page).isVisible()) ? pauseCard(page).getByTestId('controls-row') : page.getByTestId('controls-trigger');
  await press(door, touch);
  await expect(controlsSheet(page)).toBeVisible();
}
/** Done closes the sheet (a touch pick has already closed it, a desktop pick keeps it open). */
export async function closeControls(page: Page, touch = false) {
  if (await controlsSheet(page).count()) await press(controlsSheet(page).getByTestId('controls-done'), touch);
  await expect(controlsSheet(page)).toHaveCount(0);
}
/**
 * Picks `label` in the Controls sheet, from any door (openControls), and closes the sheet again. Playing: back to play with the new
 * control. Paused or from Flight settings: the pause card is back, still paused (Resume is the player's own tap: resumeFromCard).
 */
export async function pickControl(page: Page, label: string, touch = false) {
  await openControls(page, touch);
  await press(controlsSheet(page).getByRole('radio', { name: label, exact: true }), touch);
  await closeControls(page, touch);
}
/** The pause card's Resume, and play is on: the Pause button is back. */
export async function resumeFromCard(page: Page, touch = false) {
  await press(pauseCard(page).getByRole('button', { name: 'Resume flight' }), touch);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
}
/** Closes the open dialog and plays on: the pause card is back after a close, and Resume is the player's own tap. */
export async function closeAndResume(page: Page, touch = false) {
  await press(page.getByRole('button', { name: 'Close dialog' }), touch);
  await press(pauseCard(page).getByRole('button', { name: 'Resume flight' }), touch);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
}
export const PHONE = { width: 852, height: 393 } as const;
export const DESKTOP = { width: 1440, height: 1000 } as const;

/** Telemetry (stamped every 350 ms by Telemetry.tsx). */
export async function tel(page: Page): Promise<Tel> {
  const d = await page.getByTestId('flight-telemetry').evaluate(e => ({ ...(e as HTMLElement).dataset }));
  return { pos: JSON.parse(d.position!), speed: Number(d.speed), flying: d.flying === 'true', heading: Number(d.heading), pitch: Number(d.pitch) };
}
/** data-shots on the shooter HUD (stamped every 100 ms). */
export const shots = async (page: Page) => Number(await page.getByTestId('shooter-hud').getAttribute('data-shots'));
export const acquired = (page: Page) => page.evaluate(() => document.querySelector('[data-testid=shooter-hud]')?.getAttribute('data-acquired') === 'true');
/** Every distinct text any aria-live region showed since load (the store message, the shooter's 'Drone down', lab notes). */
export const said = (page: Page) => page.evaluate(() => (window as unknown as { __labSaid: string[] }).__labSaid.slice());
/** The Brush/Draw hold guide (HoldGuide.tsx): shown and at least one labelled path visible. */
export const guideShown = (page: Page) => page.evaluate(() => {
  const svg = [...document.querySelectorAll('svg')].find(s => s.textContent?.includes('Soar') || s.textContent?.includes('Draw from here'));
  return !!svg && svg.style.display !== 'none' && [...svg.querySelectorAll('g > g')].some(g => Number(g.getAttribute('opacity')) > 0);
});

/**
 * A page after Begin with `scheme` (any registry id, or 'standard') chosen by ?controls= (a session override), on a phone (touch
 * emulation, isMobile) or a non-touch desktop. `saved` seeds the save once. Captures page errors and every aria-live text.
 */
export async function labPage(browser: Browser, scheme: AnyControl, opts: { touch?: boolean; viewport?: { width: number; height: number };
  saved?: Record<string, unknown>; url?: string; init?: () => void;
  /** Runs on the new page before it navigates: routes that the page's first requests (the vote's ballot check) must already meet. */
  routes?: (page: Page) => Promise<unknown> } = {}) {
  const touch = !!opts.touch, viewport = opts.viewport ?? (touch ? PHONE : DESKTOP);
  const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const w = window as unknown as { __labSaid: string[] }; w.__labSaid = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[aria-live]')) { const t = el.textContent?.trim(); if (t && !w.__labSaid.includes(t)) w.__labSaid.push(t); }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  if (opts.init) await page.addInitScript(opts.init);
  if (opts.saved) await page.addInitScript(s => {
    if (!sessionStorage.getItem('lab-seeded')) { sessionStorage.setItem('lab-seeded', '1'); localStorage.setItem('halaverga-flight-v1', JSON.stringify(s)); }
  }, opts.saved);
  if (opts.routes) await opts.routes(page);
  await page.goto(opts.url ?? (scheme === 'standard' ? '/' : `/?controls=${scheme}`));
  const begin = page.getByRole('button', { name: 'Begin expedition' });
  await expect(begin).toBeEnabled({ timeout: 60000 });
  if (touch) await begin.tap(); else await begin.click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  if (isLab(scheme)) await expect(page.getByTestId('lab-surface')).toHaveCount(1);
  const cdp = await context.newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: { id: number; x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) })) });
  // One finger at a time is enough for these specs. Each CDP touch dispatch takes tens of ms, so fast strokes use few samples.
  const finger = {
    at: { x: 0, y: 0 } as Pt,
    down: (p: Pt) => { finger.at = p; return send('touchStart', [{ id: 1, ...p }]); },
    move: (p: Pt) => { finger.at = p; return send('touchMove', [{ id: 1, ...p }]); },
    up: () => send('touchEnd', [{ id: 1, ...finger.at }]),
    cancel: () => send('touchCancel', []),
    /** A straight drag in n samples, `gap` ms apart (plus the dispatch time). */
    async drag(to: Pt, n = 10, gap = 16) {
      const from = finger.at;
      for (let i = 1; i <= n; i++) { await finger.move({ x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n }); if (gap) await page.waitForTimeout(gap); }
    },
  };
  return { context, page, errors, send, finger, viewport };
}

/** Lift with the Lift button (tap on a phone, click on a desktop) and wait for the hover. */
export async function lift(page: Page, touch = false) {
  const b = page.getByRole('button', { name: 'Lift', exact: true });
  if (touch) await b.tap(); else await b.click();
  await expect.poll(async () => (await tel(page)).flying).toBe(true);
  await page.waitForTimeout(1200);
}

/** Drone eyes (saturated red blobs) in a screenshot of the page, CSS px, biggest first. */
export async function drones(page: Page): Promise<(Pt & { n: number })[]> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height, seen = new Uint8Array(W * H), out = [];
    const red = (i: number) => d[i * 4] > 190 && d[i * 4 + 1] < 110 && d[i * 4 + 2] < 100 && d[i * 4] - d[i * 4 + 1] > 120;
    for (let p = 0; p < W * H; p++) {
      if (seen[p] || !red(p)) continue;
      let n = 0, sx = 0, sy = 0; const stack = [p]; seen[p] = 1;
      while (stack.length) {
        const q = stack.pop()!, x = q % W, y = (q / W) | 0; n++; sx += x; sy += y;
        for (const r of [q - 1, q + 1, q - W, q + W]) if (r >= 0 && r < W * H && !seen[r] && Math.abs((r % W) - x) <= 1 && red(r)) { seen[r] = 1; stack.push(r); }
      }
      if (n >= 6) out.push({ x: sx / n * innerWidth / W, y: sy / n * innerHeight / H, n });
    }
    return out.sort((a, b) => b.n - a.n);
  }, png);
}
/** The biggest drone eye inside the box (clear of the header and the Lift/Land button), or null. */
export async function droneIn(page: Page, box: { x0: number; y0: number; x1: number; y1: number }, minPx = 12) {
  return (await drones(page)).find(d => d.n >= minPx && d.x > box.x0 && d.x < box.x1 && d.y > box.y0 && d.y < box.y1) ?? null;
}

/**
 * Turns the view with the arrow keys until the view centre rests on a drone (the shooter HUD's data-acquired). Arrow keys tag
 * lookSource 'keyboard', so touch auto-fire stays off during the hunt. Closed loop on the nearest drone eye. False if none.
 */
export async function aimAtDrone(page: Page, budgetMs = 20000) {
  const v = page.viewportSize()!, cx = v.width / 2, cy = v.height / 2, t0 = Date.now();
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

/** Init script: counts WebGL draw calls and triangles per animation frame into window.__labFrames (the renderer's own work). */
export function countDraws() {
  const w = window as unknown as { __labFrames: { calls: number; tris: number; ms: number }[] };
  let calls = 0, tris = 0, last = 0; w.__labFrames = [];
  const tri = (mode: number, count: number, inst = 1) => (mode === 4 ? count / 3 : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0) * inst;
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const p = C.prototype as unknown as Record<string, (...a: number[]) => void>;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const f = p[name]; if (!f) continue;
      p[name] = function (this: unknown, ...a: number[]) {
        calls++;
        tris += name === 'drawArrays' ? tri(a[0], a[2]) : name === 'drawElements' ? tri(a[0], a[1]) : name === 'drawArraysInstanced' ? tri(a[0], a[2], a[3]) : tri(a[0], a[1], a[4]);
        return f.apply(this, a);
      };
    }
  }
  const tick = (t: number) => { if (calls) w.__labFrames.push({ calls, tris, ms: last ? t - last : 0 }); calls = tris = 0; last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
/** Median draw calls and triangles, and p50/p95 frame ms, over the frames counted in the next `ms`. */
export async function drawStats(page: Page, ms = 2000) {
  await page.evaluate(() => { (window as unknown as { __labFrames: unknown[] }).__labFrames.length = 0; });
  await page.waitForTimeout(ms);
  const f = await page.evaluate(() => (window as unknown as { __labFrames: { calls: number; tris: number; ms: number }[] }).__labFrames.slice());
  const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
  const ms1 = f.map(x => x.ms).filter(x => x > 0);
  return { frames: f.length, calls: q(f.map(x => x.calls), .5), tris: Math.round(q(f.map(x => x.tris), .5)), p50: q(ms1, .5), p95: q(ms1, .95) };
}
/** The first candidate point with no drone eye within `r` px (a click there starts ink or a stroke instead of a blast). */
export async function clearOfDrones(page: Page, candidates: Pt[], r = 70): Promise<Pt> {
  const ds = await drones(page);
  return candidates.find(c => ds.every(d => Math.hypot(d.x - c.x, d.y - c.y) > r)) ?? candidates[0];
}
/**
 * Desktop Draw/Brush: clicks the first candidate that starts ink rather than a blast. A drone seen from behind shows no red eye,
 * so the screenshot check alone can miss it: a click that fired (data-shots moved) counts as a miss and the next point is tried
 * (that click's ink, if any, never started).
 */
export async function startInk(page: Page, candidates: Pt[]): Promise<Pt> {
  const ds = await drones(page);
  for (const c of candidates.filter(c => ds.every(d => Math.hypot(d.x - c.x, d.y - c.y) > 70))) {
    const before = await shots(page);
    await page.mouse.move(c.x, c.y); await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(250);
    if (await shots(page) === before) return c;
  }
  throw new Error('every ink start hit a drone');
}

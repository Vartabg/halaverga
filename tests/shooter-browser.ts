import { expect, type Browser, type Page } from '@playwright/test';
import { heading, speed, telemetry } from './flow-browser';
export { heading, speed, telemetry };
// Shared helpers for the suit-blaster browser specs. Telemetry (data-heading, data-speed) comes from flow-browser.
export const hud = (p: Page) => p.getByTestId('shooter-hud');
export const reticle = (p: Page) => p.locator('[class*="reticle"]');
export const shots = async (p: Page) => Number(await hud(p).getAttribute('data-shots'));
export const fov = async (p: Page) => Number(await hud(p).getAttribute('data-fov'));
export const aiming = (p: Page) => hud(p).getAttribute('data-aiming');
// Seeds the save once per tab: a reload keeps what the app itself saved since (settings changed in the test persist).
export const seed = (p: Page, saved: Record<string, unknown>) =>
  p.addInitScript(s => {
    if (location.protocol === 'data:') return; // the page before the app (twinTouchPage) has no storage
    if (!sessionStorage.getItem('halaverga-seeded')) { sessionStorage.setItem('halaverga-seeded', '1'); localStorage.setItem('halaverga-flight-v1', JSON.stringify(s)); }
  }, saved);
export async function begin(page: Page, url = '/') {
  await page.goto(url); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
}
export async function resume(page: Page) {
  await page.getByRole('button', { name: 'Resume flight' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
}
export type Touch = { id: number; x: number; y: number };
type Viewport = { width: number; height: number };
/** The legacy touch specs cover the one-thumb scheme: saves are version 3 (no migration), classic, Aim button off. */
export const CLASSIC = { controlsVersion: 3, touchScheme: 'classic', aimButton: false } as const;
/** A classic touch page after Begin (auto-fire on unless `saved` says otherwise). `init` runs before the app's scripts. */
export async function autoTouchPage(browser: Browser, viewport: Viewport, saved?: Record<string, unknown>, url = '/', init?: () => void) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await seed(page, { ...CLASSIC, ...saved });
  if (init) await page.addInitScript(init);
  await page.goto(url); await page.getByRole('button', { name: 'Begin expedition' }).tap();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Touch[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p })) });
  // A flight-thumb spot clear of every control: the lower-left quarter of the scene.
  const thumb: Touch = { id: 1, x: Math.round(viewport.width * .25), y: Math.round(viewport.height * .7) };
  return { context, page, cdp, send, thumb, errors, surface: page.getByTestId('flight-surface') };
}
/** The Fire/Aim specs: auto-fire off and the Aim button on, so every existing Fire and Aim check keeps its controls. */
export async function touchPage(browser: Browser, viewport: Viewport, saved?: Record<string, unknown>, init?: () => void) {
  const t = await autoTouchPage(browser, viewport, { autoFire: false, aimButton: true, ...saved }, '/', init), fire = t.page.getByTestId('fire-button');
  await expect(fire).toBeVisible();
  const box = (await fire.boundingBox())!;
  const trigger: Touch = { id: 2, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  return { ...t, fire, box, trigger };
}
export type Pt = { x: number; y: number };
export type SafeInsets = { top: number; right: number; bottom: number; left: number };
type Box = { x: number; y: number; width: number; height: number };
/**
 * The default twin-stick touch page after Begin: fresh storage unless `saved` is given (the look-gain specs pass { aimAssist: 0 }).
 * `insets` asks Chrome for a safe-area override (CDP Emulation.setSafeAreaInsetsOverride, where supported; `insetsApplied` says
 * whether it took). `touch` tracks every finger so each touchStart/touchMove carries all active contacts; `up` lifts only its own.
 */
export async function twinTouchPage(browser: Browser, viewport: Viewport, saved?: Record<string, unknown>, insets?: SafeInsets, url = '/', fresh = false) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  if (saved) await seed(page, saved);
  const cdp = await context.newCDPSession(page);
  let insetsApplied = false;
  if (insets) try {
    await (cdp.send as (m: string, p: object) => Promise<unknown>)('Emulation.setSafeAreaInsetsOverride', { insets }); insetsApplied = true;
  } catch { /* this Chrome has no override: the specs run with zero insets and say so */ }
  // A page to go back to (opened from a link), unless `fresh`: a new tab from a QR code or Messages, where history.length is 1.
  // A Playwright page keeps its about:blank entry (length 2), so the fresh tab's length is simulated.
  if (fresh) await page.addInitScript(() => Object.defineProperty(History.prototype, 'length', { configurable: true, get: () => 1 }));
  else await page.goto('data:text/html,<title>before</title>');
  await page.goto(url); await page.getByRole('button', { name: 'Begin expedition' }).tap();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Touch[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p })) });
  const fingers = new Map<number, Pt>();
  const all = () => [...fingers].map(([id, p]) => ({ id, x: Math.round(p.x), y: Math.round(p.y) }));
  const touch = {
    down: (id: number, p: Pt) => { fingers.set(id, p); return send('touchStart', all()); },
    move: (id: number, p: Pt) => { fingers.set(id, p); return send('touchMove', all()); },
    // Lifts one finger: a touchEnd that lists only that point. (A touchMove that merely omits it lifts nothing in Chrome, and a
    // touchEnd listing the fingers still down releases the wrong one.)
    up: (id: number) => {
      const p = fingers.get(id)!; fingers.delete(id);
      return send('touchEnd', [{ id, x: Math.round(p.x), y: Math.round(p.y) }]);
    },
    cancel: () => { fingers.clear(); return send('touchCancel', []); },
    /** Moves one finger in `steps` even steps, one per animation frame or so. */
    async drag(id: number, dx: number, dy: number, steps = 10) {
      const from = fingers.get(id)!;
      for (let i = 1; i <= steps; i++) { await this.move(id, { x: from.x + dx * i / steps, y: from.y + dy * i / steps }); await page.waitForTimeout(16); }
    },
  };
  const surface = page.getByTestId('flight-surface'), fire = page.getByTestId('fire-button'), rise = page.getByTestId('rise-button');
  const descend = page.getByTestId('descend-button'), aim = page.getByTestId('aim-button');
  await expect(surface).toHaveAttribute('data-layout', /normal|compact|portrait/);
  const g = await twinGeometry(page);
  return { context, page, cdp, send, touch, errors, insetsApplied, surface, fire, rise, descend, aim, ...g };
}
export const centre = (b: Box): Pt => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/**
 * The touch bands (spec section 2) and two safe points measured from the page: the stick zone's centre and the look pad's centre.
 * Hit circles reach a few px past each drawn button, so the points keep to the middle of their regions.
 */
export async function twinGeometry(page: Page) {
  const view = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(probe); const s = getComputedStyle(probe);
    const insets = { top: parseFloat(s.paddingTop), right: parseFloat(s.paddingRight), bottom: parseFloat(s.paddingBottom), left: parseFloat(s.paddingLeft) };
    probe.remove();
    const vv = visualViewport!, header = document.querySelector('main header')!.getBoundingClientRect();
    return { w: vv.width, h: vv.height, insets, headerBottom: header.bottom };
  });
  const layout = await page.getByTestId('flight-surface').getAttribute('data-layout');
  const boxes: Box[] = [];
  for (const id of ['fire-button', 'rise-button', 'descend-button', 'aim-button']) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) boxes.push((await b.boundingBox())!);
  }
  const { w, h, insets } = view, portrait = layout === 'portrait';
  // Touches may start anywhere but a 12 px strip at each physical edge (the bottom strip is the home-indicator inset less 8).
  const bands = { l: 12, r: w - 12, t: view.headerBottom + 8, b: h - Math.max(12, insets.bottom - 8) };
  const minLeft = boxes.length ? Math.min(...boxes.map(b => b.x)) : bands.r, minTop = boxes.length ? Math.min(...boxes.map(b => b.y)) : bands.b;
  const zoneR = Math.min((portrait ? .5 : .45) * w, minLeft - 20), zoneT = Math.max(bands.t, (portrait ? .45 : .3) * h);
  const stickPoint = { x: Math.round((bands.l + 40 + zoneR) / 2), y: Math.round((zoneT + bands.b) / 2) };
  // Look: landscape between the stick zone and the cluster; portrait above both.
  const lookPoint = portrait ? { x: Math.round(w / 2), y: Math.round((bands.t + Math.min(zoneT, minTop)) / 2) }
    : { x: Math.round((zoneR + minLeft) / 2), y: Math.round((bands.t + bands.b) / 2) };
  return { layout, bands, view, boxes, stickPoint, lookPoint };
}

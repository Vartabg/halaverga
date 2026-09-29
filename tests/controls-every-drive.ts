import { expect, type Page } from '@playwright/test';
import type { ControlId } from '../src/game/controlTypes';
import { clearOfDrones, lift, startInk, tel, type Pt } from './lab-browser';
import { hud as flowHud, wheel as flowWheel } from './flow-browser';
import { shots, twinGeometry } from './shooter-browser';
// One real interaction per control type, driven the way its own spec drives it (trackpad.spec, simple-trackpad.spec, flow.spec,
// lab-*.spec, twin-stick.spec, classic-blast.spec), with coordinates as fractions of the viewport so both phone orientations work.
// System Chrome emulation: it proves each layer answers a real gesture, never how the control feels on an iPhone or a Mac trackpad.
export type Finger = { at: Pt; down(p: Pt): Promise<unknown>; move(p: Pt): Promise<unknown>; up(): Promise<unknown>; drag(to: Pt, n?: number, gap?: number): Promise<void> };
export type Drive = { page: Page; finger: Finger; view: { width: number; height: number }; touch: boolean };
const scene = (p: Page) => p.getByTestId('flight-surface');
const speed = async (p: Page) => (await tel(p)).speed;
const heading = async (p: Page) => (await tel(p)).heading;
const locked = (p: Page) => p.evaluate(() => !!document.pointerLockElement);
const at = (v: Drive['view'], fx: number, fy: number): Pt => ({ x: Math.round(v.width * fx), y: Math.round(v.height * fy) });
const centre = (b: { x: number; y: number; width: number; height: number }): Pt => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const turned = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
const STARTS = [{ x: 640, y: 460 }, { x: 760, y: 340 }, { x: 600, y: 380 }, { x: 700, y: 520 }];

export const DRIVES: Record<ControlId, (d: Drive) => Promise<string>> = {
  // ---- phone / touch ----
  async 'one-finger'({ page, finger, view }) {
    const thumb = at(view, .25, .7), h0 = await heading(page);
    await finger.down(thumb);
    await expect.poll(async () => (await tel(page)).flying, { timeout: 2500 }).toBe(true);
    await expect.poll(() => speed(page), { timeout: 2500 }).toBeGreaterThan(5);
    await finger.drag(at(view, .7, .7), 8); await page.waitForTimeout(600);
    expect(turned(h0, await heading(page))).toBeGreaterThan(.15);
    await finger.up();
    await expect.poll(() => speed(page), { timeout: 2500 }).toBeLessThan(.5);
    return 'hold flew, slide steered, release hovered';
  },
  async 'twin-stick'({ page, finger }) {
    const g = await twinGeometry(page), rise = centre((await page.getByTestId('rise-button').boundingBox())!);
    await finger.down(rise); await page.waitForTimeout(150); await finger.up();
    await expect.poll(async () => (await tel(page)).flying, { timeout: 3000 }).toBe(true);
    await expect.poll(() => speed(page), { timeout: 4000 }).toBeLessThan(.5);
    const h0 = await heading(page);
    await finger.down(g.lookPoint); await finger.drag({ x: g.lookPoint.x - 100, y: g.lookPoint.y }, 10); await finger.up();
    await page.waitForTimeout(600); expect(turned(h0, await heading(page))).toBeGreaterThan(.2);
    await finger.down(g.stickPoint); await finger.drag({ x: g.stickPoint.x, y: g.stickPoint.y - 70 }, 8); await page.waitForTimeout(900);
    expect(await speed(page)).toBeGreaterThan(1);
    await finger.up();
    const fire = page.getByTestId('fire-button'), before = await shots(page);
    await expect(fire).toBeVisible(); // autoFire is seeded off for this test, so the Fire button is on screen
    await finger.down(centre((await fire.boundingBox())!)); await page.waitForTimeout(120); await finger.up();
    await expect.poll(() => shots(page), { timeout: 3000 }).toBeGreaterThan(before);
    return 'rise lifted, look pad turned, stick moved, Fire blasted';
  },
  // ---- both families: the gesture labs (a finger on a phone, the pointer on a desktop) ----
  async draw(d) {
    const { page, finger, view } = d;
    if (!d.touch) return desktopDraw(d);
    const a = await tel(page);
    await finger.down(at(view, .15, .6)); await finger.drag(at(view, .6, .4), 24);
    await expect.poll(async () => (await tel(page)).flying, { timeout: 4000 }).toBe(true);
    // Moved along the ink (telemetry stamps every 350 ms, so a short stroke can be over before a speed sample lands).
    await expect.poll(async () => { const b = await tel(page); return Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]); }, { timeout: 4000 }).toBeGreaterThan(3);
    await finger.up();
    return 'a drawn stroke lifted off and flew along the ink';
  },
  async conduct(d) {
    const { page, finger, view } = d;
    if (!d.touch) return desktopConduct(d);
    await lift(page, true);
    const a = await heading(page), p = at(view, .85, .5);
    await finger.down(p); await finger.move({ x: p.x + 2, y: p.y }); await page.waitForTimeout(1500);
    expect(await heading(page)).toBeLessThan(a - .2); expect(await speed(page)).toBeGreaterThan(1);
    await finger.up();
    await expect.poll(() => speed(page), { timeout: 5000 }).toBeLessThan(.3);
    return 'a resting finger steered and moved, lifting it hovered';
  },
  async brush(d) {
    const { page, finger, view } = d;
    if (!d.touch) return desktopBrush(d);
    await lift(page, true);
    await expect.poll(() => speed(page)).toBeGreaterThan(10);
    const y0 = (await tel(page)).pos[1];
    await finger.down(at(view, .5, .72)); await finger.drag(at(view, .5, .25), 4, 0); await finger.up();
    let peak = -Infinity; const end = Date.now() + 2500;
    while (Date.now() < end) { peak = Math.max(peak, (await tel(page)).pos[1] - y0); await page.waitForTimeout(100); }
    expect(peak).toBeGreaterThanOrEqual(5);
    return `a swipe up soared ${peak.toFixed(1)} m`;
  },
  // ---- desktop ----
  async cursor({ page }) {
    await lift(page);
    await page.mouse.move(720, 380);
    const h0 = await heading(page);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW');
    await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
    await expect.poll(() => speed(page)).toBeGreaterThan(6);
    await page.mouse.move(1000, 380, { steps: 10 });
    await expect.poll(() => heading(page)).toBeLessThan(h0 - .2);
    await page.mouse.click(1000, 380); // a click brakes the cruise; the next click, hovering, fires
    await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
    await expect.poll(() => speed(page)).toBeLessThan(.3);
    const before = await shots(page);
    await page.mouse.click(1000, 380);
    await expect.poll(() => shots(page), { timeout: 3000 }).toBeGreaterThan(before);
    return 'W cruised, the cursor steered, a click braked, a click fired';
  },
  async 'one-finger-keys'({ page }) {
    await page.mouse.click(720, 450);
    await expect.poll(() => locked(page)).toBe(true);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await tel(page)).flying).toBe(true);
    const h0 = await heading(page);
    await page.mouse.move(820, 450, { steps: 10 });
    await expect.poll(() => heading(page)).toBeLessThan(h0 - .2);
    await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(8);
    await page.keyboard.up('KeyW'); await expect.poll(() => speed(page)).toBeLessThan(.1);
    const before = await shots(page);
    await page.mouse.click(820, 450);
    await expect.poll(() => shots(page), { timeout: 3000 }).toBeGreaterThan(before);
    return 'click captured, Space lifted, the pointer looked, W flew, a click fired';
  },
  async flow({ page }) {
    const ground = (await tel(page)).pos[1];
    await page.mouse.click(720, 500);
    await expect(flowHud(page)).toHaveAttribute('data-capture', 'engaged');
    await expect.poll(async () => (await tel(page)).flying).toBe(true);
    await expect.poll(async () => (await tel(page)).pos[1]).toBeGreaterThan(ground + .5);
    await expect.poll(() => speed(page)).toBeLessThan(.1);
    const h0 = await heading(page);
    await page.mouse.move(820, 500, { steps: 10 });
    await expect.poll(async () => turned(h0, await heading(page))).toBeGreaterThan(.1);
    await flowWheel(page, -80, false);
    await expect.poll(() => speed(page)).toBeGreaterThan(.5);
    await expect(flowHud(page)).toHaveAttribute('data-capture', 'engaged');
    return 'a click engaged, sliding looked, a scroll glided';
  },
  async captured({ page }) {
    await page.mouse.click(720, 500);
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.getAttribute('data-testid'))).toBe('flight-surface');
    await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
    await expect.poll(() => speed(page)).toBeGreaterThan(7);
    const h0 = await heading(page);
    await page.mouse.move(820, 500, { steps: 10 });
    await expect.poll(() => heading(page)).toBeLessThan(h0 - .2);
    await page.mouse.down(); await page.mouse.up();
    await expect.poll(() => locked(page)).toBe(false);
    await expect.poll(() => speed(page)).toBeLessThan(.3);
    return 'a click cruised and hid the pointer, moving steered, a click gave it back';
  },
  async 'mouse-keys'({ page }) {
    await page.mouse.click(720, 500);
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
    const h0 = await heading(page);
    await page.mouse.move(820, 500, { steps: 10 });
    await expect.poll(() => heading(page)).toBeLessThan(h0 - .2);
    await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(.5);
    await page.keyboard.up('KeyW'); await expect.poll(() => speed(page)).toBeLessThan(.5);
    const before = await shots(page);
    await page.mouse.click(820, 500);
    await expect.poll(() => shots(page), { timeout: 3000 }).toBeGreaterThan(before);
    return 'click captured the mouse, it looked, W walked, a click fired';
  },
};

async function desktopDraw({ page }: Drive) {
  await lift(page);
  const a = await tel(page), o = await startInk(page, STARTS);
  for (let i = 1; i <= 30; i++) { await page.mouse.move(o.x + i * 6, o.y - i * 4); await page.waitForTimeout(16); }
  expect((await tel(page)).speed).toBeGreaterThan(8);
  await expect.poll(async () => (await tel(page)).heading, { timeout: 4000 }).toBeLessThan(a.heading - .05);
  return 'click then move inked, the hero flew the ink';
}
async function desktopConduct({ page }: Drive) {
  await lift(page);
  const a = await tel(page);
  await page.mouse.move(720, 420); await page.mouse.click(720, 420);
  await expect.poll(() => speed(page), { timeout: 4000 }).toBeGreaterThan(2);
  await page.mouse.move(1100, 420, { steps: 10 });
  await expect.poll(() => heading(page), { timeout: 4000 }).toBeLessThan(a.heading - .3);
  await page.mouse.move(720, 420, { steps: 10 }); await page.waitForTimeout(300); await page.mouse.click(720, 420);
  await expect.poll(() => speed(page), { timeout: 4000 }).toBeLessThan(.3);
  return 'a click cruised, pointing steered, a click hovered';
}
async function desktopBrush({ page }: Drive) {
  await lift(page);
  const y0 = (await tel(page)).pos[1], o = await clearOfDrones(page, [{ x: 600, y: 600 }, { x: 800, y: 600 }, { x: 500, y: 650 }]);
  await page.mouse.move(o.x, o.y); await page.mouse.click(o.x, o.y);
  for (let i = 1; i <= 12; i++) { await page.mouse.move(o.x, o.y - 25 * i); await page.waitForTimeout(16); }
  let peak = -Infinity; const end = Date.now() + 2500;
  while (Date.now() < end) { peak = Math.max(peak, (await tel(page)).pos[1] - y0); await page.waitForTimeout(100); }
  expect(peak).toBeGreaterThanOrEqual(5);
  return `click then sweep up soared ${peak.toFixed(1)} m`;
}

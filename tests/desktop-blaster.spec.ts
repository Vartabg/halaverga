import { expect, test, type Page } from '@playwright/test';
import { begin, fov, heading, resume, shots, speed, telemetry } from './shooter-browser';
// The classic free trackpad (7945430) is the desktop default again, with one blaster change (Garo 2026-09-24): while stopped or on
// the ground a click fires once on release (however long it is held), a drag only looks, and W (in the air) or Space flies.
test.use({ viewport: { width: 1440, height: 1000 }, hasTouch: false, isMobile: false });
const scene = (p: Page) => p.getByTestId('flight-surface');
const active = (p: Page) => scene(p).getAttribute('data-trackpad-active');
/** data-shots is stamped every 100 ms and telemetry every 350 ms: let both settle before an exact comparison. */
const settle = (p: Page) => p.waitForTimeout(450);
const turned = async (p: Page, from: number) => Math.abs((await heading(p)) - from);
/** The pointer never hides over the scene (as at 7945430). */
const cursor = (p: Page) => scene(p).evaluate(e => getComputedStyle(e).cursor);
async function lift(page: Page) {
  await page.getByRole('button', { name: 'Lift', exact: true }).click();
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await page.waitForTimeout(600); await expect.poll(() => speed(page)).toBeLessThan(.3);
}

test('fresh page: free is saved as v4, clicks fire once on the ground and in hover, a long still press fires once, nothing locks, the cursor shows', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) (window as unknown as { locked: boolean }).locked = true;
  }));
  await begin(page);
  await expect(scene(page)).toHaveAttribute('data-hover-fire', 'true'); expect(await cursor(page)).not.toBe('none');
  await page.mouse.click(720, 500); await settle(page);
  expect(await shots(page)).toBe(1); expect(await active(page)).toBe('false');
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false'); expect(await speed(page)).toBeLessThan(.3);
  await lift(page);
  await expect(scene(page)).toHaveAttribute('data-hover-fire', 'true');
  await page.mouse.click(720, 500); await settle(page);
  expect(await shots(page)).toBe(2); expect(await active(page)).toBe('false'); expect(await speed(page)).toBeLessThan(.3);
  // Held still 600 ms: nothing while held, one shot on release (no hold fire; C is the sustained trigger).
  await page.mouse.down(); await page.waitForTimeout(600); await settle(page);
  expect(await shots(page)).toBe(2);
  await page.mouse.up(); await settle(page); expect(await shots(page)).toBe(3);
  expect(await cursor(page)).not.toBe('none');
  expect(await active(page)).toBe('false');
  await page.getByRole('button', { name: 'Pause expedition' }).click();
  expect(await page.evaluate(() => (window as unknown as { locked?: boolean }).locked ?? false)).toBe(false);
  // A reload saves on pagehide (the game was started), so the stored profile is readable afterwards.
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1')!))).toMatchObject({ trackpadSteering: 'free', controlsVersion: 4 });
  expect(errors).toEqual([]);
});

test('drags only look: a quick drag, a slow start and a drag after a still pause', async ({ page }) => {
  await begin(page); await settle(page);
  // Quick drag: 80 px in 4 steps straight after the press.
  let before = await heading(page);
  await page.mouse.move(720, 500); await page.mouse.down(); await page.mouse.move(800, 500, { steps: 4 }); await page.mouse.up();
  await settle(page);
  expect(await shots(page)).toBe(0); expect(await turned(page, before)).toBeGreaterThan(.1);
  // Slow start: 2 px per 50 ms for 300 ms (past 6 px at about 150 ms), then 80 px.
  await page.mouse.move(600, 500); await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(600 + 2 * i, 500); await page.waitForTimeout(50); }
  await page.mouse.move(692, 500, { steps: 4 }); await page.mouse.up(); await settle(page);
  expect(await shots(page)).toBe(0);
  // Press, pause (300 and 600 ms), then drag: the hesitant "press, then look" never fires and still looks.
  for (const pause of [300, 600]) {
    before = await heading(page);
    await page.mouse.move(720, 500); await page.mouse.down(); await page.waitForTimeout(pause);
    for (let i = 1; i <= 6; i++) { await page.mouse.move(720 - 80 * i / 6, 500); await page.waitForTimeout(50); }
    await page.mouse.up(); await settle(page);
    expect([pause, await shots(page)]).toEqual([pause, 0]);
    expect(await turned(page, before)).toBeGreaterThan(.1);
  }
});

test('starting flight by key never jumps the view: W from hover, and Space after the pointer visits the Land button', async ({ page }) => {
  await begin(page); await lift(page);
  await page.mouse.move(200, 500); await settle(page);
  let before = await heading(page);
  await page.keyboard.press('KeyW'); await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await page.mouse.move(205, 500); await settle(page);
  expect(await turned(page, before)).toBeLessThan(.05);
  // Over the button the pointer has left the scene (the cruise stops, as at 7945430); back on the scene its first move only seeds.
  await page.getByRole('button', { name: /^(Land|Lift|Cancel landing)$/ }).hover();
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false'); await settle(page);
  before = await heading(page);
  await page.keyboard.press('Space');
  await page.mouse.move(720, 500); await settle(page);
  expect(await turned(page, before)).toBeLessThan(.05);
});

test('W from hover cruises: pointer steers, scroll sets speed, C fires on, Q aims, a click brakes without a shot', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await begin(page); await lift(page); await page.mouse.move(720, 500);
  await page.keyboard.down('KeyW'); await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await page.keyboard.up('KeyW'); await page.waitForTimeout(400);
  await expect.poll(() => speed(page)).toBeGreaterThan(7);
  await expect(scene(page)).toHaveAttribute('data-hover-fire', 'false');
  const before = await heading(page);
  await page.mouse.move(820, 500, { steps: 5 }); await expect.poll(() => turned(page, before)).toBeGreaterThan(.1);
  await page.mouse.move(720, 500, { steps: 5 });
  await page.mouse.wheel(0, -100); await expect.poll(() => speed(page)).toBeGreaterThan(10);
  await page.keyboard.down('KeyC'); await expect.poll(() => shots(page)).toBeGreaterThan(2);
  expect(await active(page)).toBe('true'); await page.keyboard.up('KeyC');
  const hip = await fov(page);
  await page.keyboard.down('KeyQ'); await expect.poll(() => fov(page)).toBeLessThan(hip - 5); await page.keyboard.up('KeyQ');
  await page.waitForTimeout(250); const settled = await shots(page);
  await page.mouse.click(720, 500);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await expect.poll(() => speed(page)).toBeLessThan(.3);
  await expect(scene(page)).toHaveAttribute('data-hover-fire', 'true');
  await page.waitForTimeout(400); expect(await shots(page)).toBe(settled);
  expect(errors).toEqual([]);
});

test('on the ground W walks and Space lifts off into a cruise', async ({ page }) => {
  await begin(page); await page.mouse.move(720, 500);
  await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(.5);
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false'); expect(await active(page)).toBe('false');
  await page.keyboard.up('KeyW'); await expect.poll(() => speed(page)).toBeLessThan(.5);
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await expect.poll(() => speed(page)).toBeGreaterThan(7);
});

test('closing Flight settings by × or Escape keeps Space for flight', async ({ page }) => {
  await begin(page);
  const dialog = page.getByRole('dialog'), playing = page.getByRole('button', { name: 'Pause expedition' });
  await page.getByRole('button', { name: 'Flight settings' }).click(); await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click(); await expect(dialog).toHaveCount(0); await expect(playing).toBeVisible();
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true'); await expect(dialog).toHaveCount(0);
  // Back on the terrace, then the Escape close.
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByRole('button', { name: 'Return to arrival terrace' }).click();
  const resumeButton = page.getByRole('button', { name: 'Resume flight' });
  await expect(playing.or(resumeButton)).toBeVisible();
  if (await resumeButton.isVisible()) await resume(page);
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
  await page.getByRole('button', { name: 'Flight settings' }).click(); await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(playing).toBeVisible();
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true'); await expect(dialog).toHaveCount(0);
});

test('?shooter=0: a ground click lifts and cruises exactly as at 7945430', async ({ page }) => {
  await begin(page, '/?shooter=0');
  await expect(scene(page)).toHaveAttribute('data-hover-fire', 'false');
  await page.mouse.click(720, 500);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await expect.poll(() => speed(page)).toBeGreaterThan(7);
  await expect(scene(page)).toHaveAttribute('data-hover-fire', 'false');
});

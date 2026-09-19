import { expect, test } from '@playwright/test';
import { beginFlow, heading, hud, position, release, selected, speed, telemetry, wheel } from './flow-browser';

for (const camera of ['first', 'third']) test(`Flow looks through 360 degrees in hover without a held click or drift in ${camera} person`, async ({ page }) => {
  await beginFlow(page, camera);
  const from = await position(page), yaw = await heading(page);
  await page.mouse.move(2900, 500, { steps: 45 });
  await expect.poll(async () => Math.abs(await heading(page) - yaw)).toBeGreaterThan(6.28);
  await expect(hud(page)).toHaveAttribute('data-capture', 'engaged');
  await expect.poll(() => speed(page)).toBeLessThan(.1);
  await page.waitForTimeout(1200);
  const to = await position(page); expect(Math.hypot(...to.map((v, i) => v - from[i]))).toBeLessThan(.05);
  expect(await selected(page)).toBe(0);
});
test('Flow glides below 3 m/s hands-free, scrolls to hover, and resumes from a fresh stroke', async ({ page }) => {
  await beginFlow(page);
  await page.mouse.wheel(0, -80);
  await expect.poll(() => selected(page)).toBeGreaterThan(.5);
  await expect.poll(() => speed(page)).toBeGreaterThan(.5);
  const target = await selected(page); expect(target).toBeLessThan(3);
  await page.waitForTimeout(1200); expect(await speed(page)).toBeCloseTo(target, 1);
  await page.mouse.wheel(0, 160); await expect.poll(() => selected(page)).toBe(0);
  await expect.poll(() => speed(page)).toBeLessThan(.1);
  await expect(hud(page)).toHaveAttribute('data-capture', 'engaged');
  await page.mouse.wheel(0, -80); await expect.poll(() => speed(page)).toBeGreaterThan(.5);
});
test('press and held press brake without unlocking; looking, release and double-click never relaunch', async ({ page }) => {
  await beginFlow(page); await wheel(page, -160, false); await expect.poll(() => speed(page)).toBeGreaterThan(2);
  await page.mouse.down(); await expect.poll(() => selected(page)).toBe(0);
  await wheel(page, -160, false); await page.keyboard.down('w');
  const yaw = await heading(page); await page.mouse.move(800, 480, { steps: 5 });
  await expect.poll(async () => Math.abs(await heading(page) - yaw)).toBeGreaterThan(.1);
  await expect.poll(() => speed(page)).toBeLessThan(.1);
  await page.keyboard.up('w'); await page.mouse.up(); await page.mouse.dblclick(800, 480);
  await expect(hud(page)).toHaveAttribute('data-capture', 'engaged');
  expect(await selected(page)).toBe(0); await expect.poll(() => speed(page)).toBeLessThan(.1);
});
test('inertia cannot add thrust; untagged postbrake input needs quiet and a fresh stroke', async ({ page }) => {
  await beginFlow(page); await page.mouse.click(720, 500);
  await wheel(page, -160, true); expect(await selected(page)).toBe(0);
  await wheel(page, -160); await expect.poll(() => selected(page)).toBe(0);
  await page.waitForTimeout(300); await wheel(page, -4); await wheel(page, -4);
  expect(await selected(page)).toBe(0);
  await wheel(page, -4); await expect.poll(() => selected(page)).toBeGreaterThan(0);
  const target = await selected(page); await wheel(page, -160, true); await wheel(page, -100, false, 160);
  await page.waitForTimeout(150); expect(await selected(page)).toBe(target);
});
test('secondary click frees the cursor for Land and settings, and recapture is stationary', async ({ page }) => {
  await beginFlow(page); await wheel(page, -80, false); await expect.poll(() => speed(page)).toBeGreaterThan(.5);
  await release(page); await expect.poll(() => speed(page)).toBeLessThan(.1);
  await expect(page.getByRole('button', { name: 'Land', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByLabel('Trackpad steering')).toHaveValue('flow');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.mouse.click(720, 500); await expect(hud(page)).toHaveAttribute('data-capture', 'engaged');
  expect(await selected(page)).toBe(0); await expect.poll(() => speed(page)).toBeLessThan(.1);
});
test('aiming changes climb/dive and the character follows the view', async ({ page }) => {
  await beginFlow(page); await page.mouse.move(720, 380, { steps: 10 }); await wheel(page, -160, false);
  const start = await position(page); await expect.poll(async () => (await position(page))[1]).toBeGreaterThan(start[1] + .3);
  await page.mouse.move(720, 620, { steps: 15 }); const top = await position(page);
  await expect.poll(async () => (await position(page))[1]).toBeLessThan(top[1] - .3);
  await page.mouse.click(720, 620); await expect.poll(() => speed(page)).toBeLessThan(.1);
  const view = Number(await telemetry(page).getAttribute('data-view-heading'));
  const suit = Number(await telemetry(page).getAttribute('data-suit-heading'));
  expect(Math.abs(Math.atan2(Math.sin(view - suit), Math.cos(view - suit)))).toBeLessThan(.31);
});
test('a primary press cancels assisted landing and retains free looking', async ({ page }) => {
  await beginFlow(page); await page.mouse.move(720, 840, { steps: 15 });
  await expect(page.getByText('SURFACE IN REACH · LAND', { exact: true })).toBeVisible();
  await page.keyboard.press('Space'); await expect(telemetry(page)).toContainText('APPROACH');
  await page.mouse.down(); await page.mouse.up();
  await expect(telemetry(page)).not.toContainText('APPROACH');
  await expect(hud(page)).toHaveAttribute('data-capture', 'engaged');
  await expect.poll(() => speed(page)).toBeLessThan(.1);
});

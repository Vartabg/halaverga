import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { beginFlow } from './flow-browser';
import { aiming, begin, fov, hud, resume, reticle, seed, shots } from './shooter-browser';
const scene = (p: Page) => p.getByTestId('flight-surface');
const errorsOf = (p: Page) => { const errors: string[] = []; p.on('pageerror', e => errors.push(e.message)); return errors; };

test('holding C fires on the default page; Q aims and every interruption clears it', async ({ page }) => {
  const errors = errorsOf(page); await begin(page);
  await expect(hud(page)).toHaveAttribute('data-shots', '0');
  await page.keyboard.down('KeyC'); await page.waitForTimeout(700);
  await expect.poll(() => shots(page)).toBeGreaterThan(3);
  await page.keyboard.up('KeyC');
  // data-shots is stamped every 100 ms: let the last shot land before comparing.
  await page.waitForTimeout(250); const settled = await shots(page); await page.waitForTimeout(400); expect(await shots(page)).toBe(settled);
  const interruptions: [string, () => Promise<void>][] = [
    ['pause', async () => { await page.getByRole('button', { name: 'Pause expedition' }).click(); await resume(page); }],
    ['blur', async () => { await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await resume(page); }],
    ['resize', async () => { await page.setViewportSize({ width: 1400, height: 980 }); await page.setViewportSize({ width: 1440, height: 1000 }); }],
    ['escape', async () => { await page.keyboard.press('Escape'); await resume(page); }],
  ];
  for (const [name, interrupt] of interruptions) {
    await page.keyboard.down('KeyQ');
    await expect(hud(page), name).toHaveAttribute('data-aiming', 'true');
    await interrupt();
    await expect(hud(page), name).toHaveAttribute('data-aiming', 'false');
    // Q is still physically held: its key repeat must not re-aim.
    await page.keyboard.down('KeyQ'); await page.waitForTimeout(300);
    expect(await aiming(page), name).toBe('false');
    await page.keyboard.up('KeyQ');
  }
  expect(errors).toEqual([]);
});

test('mouse mode: the capture click never fires, then an LMB+RMB chord fires while aiming', async ({ page }) => {
  const errors = errorsOf(page); await seed(page, { desktopMode: 'mouse' }); await begin(page);
  await page.mouse.click(720, 500);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await page.waitForTimeout(300); expect(await shots(page)).toBe(0);
  await page.mouse.down({ button: 'right' }); await page.mouse.down({ button: 'left' });
  await expect(hud(page)).toHaveAttribute('data-aiming', 'true');
  await expect.poll(() => shots(page)).toBeGreaterThan(2);
  await page.mouse.up({ button: 'left' }); await page.mouse.up({ button: 'right' });
  await expect(hud(page)).toHaveAttribute('data-aiming', 'false');
  expect(errors).toEqual([]);
});

test('free trackpad: the click still cruises while C fires, and hovering the crosshair keeps cruising', async ({ page }) => {
  const errors = errorsOf(page); await begin(page, '/?trackpad=free');
  await page.mouse.click(600, 450); await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await page.mouse.move(720, 500, { steps: 5 });
  await page.keyboard.down('KeyC'); await expect.poll(() => shots(page)).toBeGreaterThan(2);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await page.keyboard.up('KeyC'); await page.waitForTimeout(300);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  expect(errors).toEqual([]);
});

test('Flow: C fires while the brake is held', async ({ page }) => {
  const errors = errorsOf(page); await beginFlow(page);
  await page.mouse.down(); await page.keyboard.down('KeyC');
  await expect.poll(() => shots(page)).toBeGreaterThan(2);
  await page.keyboard.up('KeyC'); await page.mouse.up();
  await expect(page.getByTestId('flow-hud')).toHaveAttribute('data-capture', 'engaged');
  expect(errors).toEqual([]);
});

test('ADS narrows the field of view and returns it exactly; reduced motion keeps it fixed', async ({ page }) => {
  await begin(page); await page.waitForTimeout(1500);
  const before = await hud(page).getAttribute('data-fov');
  expect(Number(before)).toBeCloseTo(65, 0);
  await page.keyboard.down('KeyQ'); await page.waitForTimeout(1500);
  expect(await fov(page)).toBeLessThan(51.5); expect(await fov(page)).toBeGreaterThan(48.5);
  await page.keyboard.up('KeyQ'); await page.waitForTimeout(1000);
  await expect(hud(page)).toHaveAttribute('data-fov', before!);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByLabel('Reduced camera motion').check(); await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.keyboard.down('KeyQ'); await expect(hud(page)).toHaveAttribute('data-aiming', 'true');
  await page.waitForTimeout(800); await expect(hud(page)).toHaveAttribute('data-fov', '65.0');
  await page.keyboard.up('KeyQ');
});

test('turning the blaster off mid-aim restores the reticle; ?shooter=0 has no HUD', async ({ page }) => {
  await begin(page); await expect(reticle(page)).toHaveCount(0);
  await page.keyboard.down('KeyQ'); await expect(hud(page)).toHaveAttribute('data-aiming', 'true');
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByLabel('Suit blaster (drones and shooting)').uncheck(); await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.keyboard.up('KeyQ');
  await expect(hud(page)).toHaveCount(0); await expect(reticle(page)).toHaveCount(1);
  await page.goto('/?shooter=0'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(reticle(page)).toHaveCount(1); await expect(hud(page)).toHaveCount(0);
  await expect(page.locator('[class*="actions"][data-shooter]')).toHaveAttribute('data-shooter', 'false');
});

test('the kill announcement sits outside aria-hidden; ADS and settings pass axe', async ({ page }) => {
  const errors = errorsOf(page); await begin(page);
  const live = page.getByTestId('shooter-live');
  expect(await live.evaluate(el => el.closest('[aria-hidden]') === null)).toBe(true);
  // No deterministic browser kill: the tutorial drone's alert orbit depends on load timing (see docs/TECH_DEBT.md).
  await page.keyboard.down('KeyQ');
  const scan = async () => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await expect(hud(page)).toHaveAttribute('data-aiming', 'true'); await scan();
  await page.keyboard.up('KeyQ');
  await page.getByRole('button', { name: 'Flight settings' }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await scan();
  expect(errors).toEqual([]);
});

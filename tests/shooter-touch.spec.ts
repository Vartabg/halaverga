import { expect, test } from '@playwright/test';
import { heading, hud, shots, speed, touchPage } from './shooter-browser';
const PORTRAIT = { width: 393, height: 852 }, LANDSCAPE = { width: 852, height: 393 };
for (const viewport of [PORTRAIT, LANDSCAPE]) {
  const name = viewport === PORTRAIT ? 'portrait' : 'landscape';
  test.describe(`touch blaster, ${name}`, () => {
    test('Fire is reachable, clear of the edges and of the flight-thumb spots', async ({ browser }) => {
      const t = await touchPage(browser, viewport), { box } = t;
      expect(await t.fire.evaluate(el => getComputedStyle(el).touchAction)).toBe('none');
      const hit = { left: box.x - 6, top: box.y - 6, right: box.x + box.width + 6, bottom: box.y + box.height + 6 };
      expect(hit.left).toBeGreaterThanOrEqual(24); expect(hit.top).toBeGreaterThanOrEqual(24);
      expect(viewport.width - hit.right).toBeGreaterThanOrEqual(24); expect(viewport.height - hit.bottom).toBeGreaterThanOrEqual(24);
      for (const [x, y] of [[290, 650], [639, 275]]) expect(x >= hit.left && x <= hit.right && y >= hit.top && y <= hit.bottom).toBe(false);
      // Lift/Land stays clear of Fire (and of the portrait spec point).
      const lift = (await t.page.getByRole('button', { name: 'Lift', exact: true }).boundingBox())!;
      expect(lift.y + lift.height).toBeLessThanOrEqual(hit.top);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    for (const order of ['fly-then-fire', 'fire-then-fly'] as const) test(`${order}: both contacts are accepted`, async ({ browser }) => {
      const t = await touchPage(browser, viewport), { send, thumb, trigger, surface } = t;
      const [first, second] = order === 'fly-then-fire' ? [thumb, trigger] : [trigger, thumb];
      await send('touchStart', [first]); await t.page.waitForTimeout(300);
      await send('touchStart', [first, second]);
      await expect(surface).toHaveAttribute('data-fire-held', 'true');
      await expect(surface).toHaveAttribute('data-control-mode', 'dual');
      await expect.poll(() => shots(t.page)).toBeGreaterThan(0);
      await send('touchEnd', [thumb, trigger]);
      await expect(surface).toHaveAttribute('data-fire-held', 'false');
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('a one-thumb cruise keeps its speed when Fire is pressed; the Fire drag steers and edge-turns', async ({ browser }) => {
      const t = await touchPage(browser, viewport), { send, thumb, trigger, page } = t;
      await send('touchStart', [thumb]); await page.waitForTimeout(1100);
      await expect.poll(() => speed(page)).toBeGreaterThan(6);
      await send('touchStart', [thumb, trigger]); await expect(t.surface).toHaveAttribute('data-control-mode', 'dual');
      for (let i = 0; i < 3; i++) { await page.waitForTimeout(350); expect(await speed(page)).toBeGreaterThan(6); }
      // The flight thumb is now a move stick: sliding it sideways strafes and never turns the view.
      const before = await heading(page);
      thumb.x += 30; await send('touchMove', [thumb, trigger]); await page.waitForTimeout(500);
      expect(await heading(page)).toBe(before);
      // Dragging the Fire finger aims.
      trigger.x -= 40; await send('touchMove', [thumb, trigger]); await page.waitForTimeout(450);
      expect(await heading(page)).toBeGreaterThan(before + .05);
      // Held at the right bezel, the Fire drag keeps turning.
      trigger.x = viewport.width - 8; await send('touchMove', [thumb, trigger]); await page.waitForTimeout(400);
      const edge = await heading(page); await page.waitForTimeout(600);
      expect(await heading(page)).toBeLessThan(edge - .2);
      await send('touchEnd', [thumb, trigger]);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('firing caps a fast cruise below 14 m/s', async ({ browser }) => {
      const t = await touchPage(browser, viewport), { send, thumb, trigger, page } = t;
      await send('touchStart', [thumb]); await page.waitForTimeout(700);
      thumb.y -= Math.min(110, viewport.height * .25); thumb.x += 10; await send('touchMove', [thumb]); await page.waitForTimeout(1200);
      expect(await speed(page)).toBeGreaterThan(18);
      await send('touchStart', [thumb, trigger]); await page.waitForTimeout(1100);
      expect(await speed(page)).toBeLessThan(14);
      await send('touchEnd', [thumb, trigger]);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('Aim toggles; with tap controls, Stop keeps Aim latched', async ({ browser }) => {
      const t = await touchPage(browser, viewport, { tapControls: true }), { page } = t;
      const aim = page.locator('[data-shooter-controls]').getByRole('button', { name: 'Aim' });
      await aim.tap(); await expect(aim).toHaveAttribute('aria-pressed', 'true');
      await expect(hud(page)).toHaveAttribute('data-aiming', 'true');
      await aim.tap(); await expect(aim).toHaveAttribute('aria-pressed', 'false');
      await expect(hud(page)).toHaveAttribute('data-aiming', 'false');
      const pad = page.getByRole('group', { name: 'Tap flight controls' }), tapAim = pad.getByRole('button', { name: 'Aim' });
      await tapAim.click(); await expect(tapAim).toHaveAttribute('aria-pressed', 'true');
      await pad.getByRole('button', { name: 'Stop movement' }).click(); await page.waitForTimeout(450);
      await expect(tapAim).toHaveAttribute('aria-pressed', 'true'); await expect(hud(page)).toHaveAttribute('data-aiming', 'true');
      const tapFire = pad.getByRole('button', { name: 'Fire' });
      await tapFire.click(); await expect(tapFire).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => shots(page)).toBeGreaterThan(2);
      await tapFire.click(); await expect(tapFire).toHaveAttribute('aria-pressed', 'false');
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('touch cancel and rotation release Fire; a long press selects no text', async ({ browser }) => {
      const t = await touchPage(browser, viewport), { send, trigger, page, surface } = t;
      const wrap = page.locator('[data-shooter-controls]');
      await send('touchStart', [trigger]); await expect(wrap).toHaveAttribute('data-fire-held', 'true');
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
      await send('touchCancel', []); await expect(wrap).toHaveAttribute('data-fire-held', 'false');
      await expect(surface).toHaveAttribute('data-fire-held', 'false');
      await send('touchStart', [trigger]); await expect(wrap).toHaveAttribute('data-fire-held', 'true');
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await expect(page.locator('[data-shooter-controls]')).toHaveAttribute('data-fire-held', 'false');
      // data-shots is stamped every 100 ms: let the last shot land before comparing.
      await page.waitForTimeout(250); const settled = await shots(page); await page.waitForTimeout(500); expect(await shots(page)).toBe(settled);
      await send('touchCancel', []);
      expect(t.errors).toEqual([]); await t.context.close();
    });
  });
}

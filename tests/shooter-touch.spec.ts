import { expect, test } from '@playwright/test';
import { heading, hud, shots, speed, telemetry, touchPage } from './shooter-browser';
const PORTRAIT = { width: 393, height: 852 }, LANDSCAPE = { width: 852, height: 393 }, SE = { width: 375, height: 667 };
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
    test('Aim toggles on a second-finger tap with the flight thumb held, once per tap, and from the keyboard', async ({ browser }) => {
      const t = await touchPage(browser, viewport), { send, thumb, page } = t;
      const aim = page.locator('[data-shooter-controls]').getByRole('button', { name: 'Aim' });
      const box = (await aim.boundingBox())!, finger = { id: 3, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
      // A second finger makes no click: the toggle must come from Aim's own pointerup.
      await send('touchStart', [thumb]); await page.waitForTimeout(400);
      // CDP touchEnd releases the points it lists: lift the Aim finger, keep the thumb, then lift the thumb.
      await send('touchStart', [thumb, finger]); await page.waitForTimeout(80); await send('touchEnd', [finger]);
      await expect(aim).toHaveAttribute('aria-pressed', 'true'); await expect(hud(page)).toHaveAttribute('data-aiming', 'true');
      await send('touchEnd', [thumb]); await page.waitForTimeout(100); await expect(aim).toHaveAttribute('aria-pressed', 'true');
      await aim.tap(); await expect(aim).toHaveAttribute('aria-pressed', 'false');
      await page.waitForTimeout(300); await expect(aim).toHaveAttribute('aria-pressed', 'false');
      await aim.focus(); await page.keyboard.press('Enter'); await expect(aim).toHaveAttribute('aria-pressed', 'true');
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('with tap controls: one control per name, pad toggles, Stop keeps Aim latched, no drag hint', async ({ browser }) => {
      const t = await touchPage(browser, viewport, { tapControls: true }), { page } = t;
      await expect(page.getByTestId('controls-hint')).toContainText(/tap pad: fire and aim toggle/i);
      expect(await page.locator('body').innerText()).not.toContain('DRAG IT TO AIM');
      await expect(page.getByRole('button', { name: 'Fire', exact: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Aim', exact: true })).toHaveCount(0);
      const pad = page.getByRole('group', { name: 'Tap flight controls' }), tapAim = pad.getByRole('button', { name: 'Aim toggle', exact: true });
      await tapAim.click(); await expect(tapAim).toHaveAttribute('aria-pressed', 'true');
      await pad.getByRole('button', { name: 'Stop movement' }).click(); await page.waitForTimeout(450);
      await expect(tapAim).toHaveAttribute('aria-pressed', 'true'); await expect(hud(page)).toHaveAttribute('data-aiming', 'true');
      const tapFire = pad.getByRole('button', { name: 'Fire toggle, stops after 3 seconds' });
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
// A finger resting on Fire's outer rim (the 6 px ::before inside the edge-turn band) must not turn or pitch the view.
for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, SE]) {
  test(`${viewport.width}x${viewport.height}: holding Fire's right or bottom rim never edge-turns`, async ({ browser }) => {
    const t = await touchPage(browser, viewport), { send, page, box } = t;
    for (const rim of [{ x: box.x + box.width + 5, y: box.y + box.height / 2 }, { x: box.x + box.width / 2, y: box.y + box.height + 5 }]) {
      const finger = { id: 2, x: Math.round(rim.x), y: Math.round(rim.y) };
      expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid=fire-button]'), [finger.x, finger.y])).toBe(true);
      await send('touchStart', [finger]); await page.waitForTimeout(100);
      finger.x -= 3; finger.y -= 2; await send('touchMove', [finger]); await page.waitForTimeout(500);
      const yaw = await heading(page), pitch = Number(await telemetry(page).getAttribute('data-pitch'));
      await page.waitForTimeout(1500);
      expect(Math.abs(await heading(page) - yaw)).toBeLessThan(.01);
      expect(Math.abs(Number(await telemetry(page).getAttribute('data-pitch')) - pitch)).toBeLessThan(.01);
      await send('touchEnd', [finger]); await page.waitForTimeout(200);
    }
    expect(t.errors).toEqual([]); await t.context.close();
  });
}
test('iPhone SE portrait with tap controls: empty tap-pad cells pass touches through', async ({ browser }) => {
  const t = await touchPage(browser, SE, { tapControls: true }), { page } = t;
  const pad = page.getByRole('group', { name: 'Tap flight controls' }), r = (await pad.boundingBox())!;
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[role=group]'), [r.x + r.width - 22, r.y + r.height - 22]);
  expect(hit).toBe(false);
  expect(t.errors).toEqual([]); await t.context.close();
});

import { expect, test } from '@playwright/test';
import { autoTouchPage, hud, shots } from './shooter-browser';
// The classic one thumb (the phone default since 2026-09-26) has no Fire or Aim button: tap a drone to blast it
// (classic-blast.spec.ts). What is left here is the tap pad, the no-drag path, on top of the classic surface. Emulation only.
const PORTRAIT = { width: 393, height: 852 }, LANDSCAPE = { width: 852, height: 393 }, SE = { width: 375, height: 667 };
for (const viewport of [PORTRAIT, LANDSCAPE]) {
  const name = viewport === PORTRAIT ? 'portrait' : 'landscape';
  test.describe(`touch blaster on classic, ${name}`, () => {
    test('no Fire or Aim button; a long press selects no text', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { send, thumb, page } = t;
      await expect(page.getByTestId('fire-button')).toHaveCount(0); await expect(page.getByTestId('aim-button')).toHaveCount(0);
      await expect(page.locator('[data-shooter-controls]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Aim', exact: true })).toHaveCount(0);
      await send('touchStart', [thumb]); await page.waitForTimeout(800);
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
      await send('touchCancel', []);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('with tap controls: pad toggles, Stop keeps Aim latched, no drag hint', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport, { tapControls: true }), { page } = t;
      await expect(page.getByTestId('controls-hint')).toContainText(/tap pad: fire and aim toggle/i);
      expect(await page.locator('body').innerText()).not.toContain('DRAG IT TO AIM');
      await expect(page.getByRole('button', { name: 'Fire', exact: true })).toHaveCount(0);
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
  });
}
test('iPhone SE portrait with tap controls: empty tap-pad cells pass touches through', async ({ browser }) => {
  const t = await autoTouchPage(browser, SE, { tapControls: true }), { page } = t;
  const pad = page.getByRole('group', { name: 'Tap flight controls' }), r = (await pad.boundingBox())!;
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[role=group]'), [r.x + r.width - 22, r.y + r.height - 22]);
  expect(hit).toBe(false);
  expect(t.errors).toEqual([]); await t.context.close();
});

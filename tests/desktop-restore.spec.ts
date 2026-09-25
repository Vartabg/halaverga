import { expect, test, type Page } from '@playwright/test';
import { begin, heading, resume, seed, shots, speed, telemetry } from './shooter-browser';
// Desktop controls restore (Garo 2026-09-24): the classic free trackpad of 7945430 is the desktop default again, with one change
// for the blaster: while stopped or on the ground a click fires (once, on release), dragging only looks,
// and W (in the air) or Space starts flying. Seeded with Garo's live save: the 'simple' default from before controls version 4.
// A non-touch desktop (hasTouch false) at a full desktop size and at his 325 px Claude pane.
const GARO = { trackpadSteering: 'simple', controlsVersion: 3, hintProgress: { touch: 0, simple: 0, mouse: 0 } };
const GROUND = 'SPACE TO FLY · CLICK TO FIRE · DRAG TO LOOK';
// Hovering: W or Space flies; with a surface in reach Space lands, so the pill names only W.
const HOVER = /^(W OR SPACE TO FLY|W TO FLY · SPACE TO LAND) · CLICK TO FIRE · DRAG TO LOOK$/;
const CRUISE = 'MOVE TO STEER · SCROLL FOR SPEED · CLICK TO HOVER · HOLD C TO FIRE';
const pill = (p: Page) => p.locator('[class*="trackpadHint"]');
const scene = (p: Page) => p.getByTestId('flight-surface');
const locked = (p: Page) => p.evaluate(() => !!document.pointerLockElement);
/** data-shots is stamped every 100 ms and telemetry every 350 ms: let both settle before an exact comparison. */
const settle = (p: Page) => p.waitForTimeout(450);

for (const viewport of [{ width: 1440, height: 900 }, { width: 325, height: 928 }]) test.describe(`${viewport.width}x${viewport.height}`, () => {
  test.use({ viewport, hasTouch: false, isMobile: false });
  test('classic free trackpad: click fires while stopped, W or Space flies, click brakes, no phone UI or pauses', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await seed(page, GARO); await begin(page);
    // Points in the open scene, clear of the header and the Lift/Land button at both sizes.
    const w = viewport.width, h = viewport.height;
    const a = { x: Math.round(w * .5), y: Math.round(h * .38) }, b = { x: Math.round(w * .5) + 100, y: a.y }, c = { x: a.x, y: Math.round(h * .45) };

    // On the ground: the ground pill, no simple-profile panel or hint series, and the aim cursor.
    await expect(pill(page)).toHaveText(GROUND);
    await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
    await expect(page.getByTestId('controls-hint')).toHaveCount(0);
    await expect(page.getByTestId('simple-trackpad-hud')).toHaveCount(0);
    await expect(scene(page)).toHaveAttribute('data-hover-fire', 'true');
    expect(await scene(page).evaluate(e => getComputedStyle(e).cursor)).not.toBe('none');
    expect(await page.evaluate(() => document.documentElement.dataset.playing ?? null)).toBeNull();

    // A clean click is exactly one shot, never a pointer lock, never a takeoff.
    await page.mouse.move(a.x, a.y); await page.mouse.click(a.x, a.y);
    await expect.poll(() => shots(page)).toBe(1);
    await settle(page); expect(await shots(page)).toBe(1);
    expect(await locked(page)).toBe(false);
    await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
    await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');

    // Space lifts and cruises.
    await page.keyboard.press('Space');
    await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
    await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
    await expect.poll(() => speed(page)).toBeGreaterThan(5);
    await expect(pill(page)).toHaveText(CRUISE);
    await expect(scene(page)).toHaveAttribute('data-hover-fire', 'false');

    // Moving the pointer steers (no button held).
    const before = await heading(page);
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await expect.poll(() => heading(page)).toBeLessThan(before - .2);

    // A click while cruising brakes to hover with no shot.
    const fired = await shots(page);
    await page.mouse.click(b.x, b.y);
    await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
    await expect.poll(() => speed(page)).toBeLessThan(.3);
    await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
    await settle(page); expect(await shots(page)).toBe(fired);
    await expect(pill(page)).toHaveText(HOVER);
    await expect(scene(page)).toHaveAttribute('data-hover-fire', 'true');
    expect(await scene(page).evaluate(e => getComputedStyle(e).cursor)).not.toBe('none');

    // Hovering: the pointer moves without a press (tracked, no look), then W cruises again with no jump on the first move.
    const hover = await heading(page);
    await page.mouse.move(c.x, c.y, { steps: 5 }); await settle(page);
    expect(Math.abs(await heading(page) - hover)).toBeLessThan(.02);
    await page.keyboard.down('KeyW');
    await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
    await settle(page); const cruiseStart = await heading(page);
    await page.mouse.move(c.x + 2, c.y); await settle(page);
    expect(Math.abs(await heading(page) - cruiseStart)).toBeLessThan(.05);
    // The cruise stays on after W is released, as the old click cruise did.
    await page.keyboard.up('KeyW'); await page.waitForTimeout(300);
    await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
    await page.mouse.click(c.x + 2, c.y);
    await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');

    // Flight settings: the saved 'simple' default came back as the free cursor. Closing returns focus to the scene, so Space
    // flies instead of reopening the dialog.
    await page.getByRole('button', { name: 'Flight settings' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect(page.getByLabel('Trackpad steering')).toHaveValue('free');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
    await page.keyboard.press('Space'); await page.waitForTimeout(400);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
    // Hovering, Space either starts the cruise or, with a surface in reach, lands (the 7945430 meaning).
    const landable = await page.getByText('SURFACE IN REACH · LAND').isVisible();
    if (!landable) await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
    if (await scene(page).getAttribute('data-trackpad-active') === 'true') {
      await page.mouse.click(c.x, c.y); await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
    }

    // No touch layer, touch cluster, fixed page or sound popup on a non-touch desktop.
    for (const id of ['touch-layer', 'fire-button', 'rise-button', 'touch-stick']) await expect(page.getByTestId(id), id).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.playing ?? null)).toBeNull();
    await expect(page.getByText('Blaster sound is off')).toHaveCount(0);
    expect(await locked(page)).toBe(false);

    // Escape pauses; Resume brings back the pill for where the explorer is.
    const flying = await telemetry(page).getAttribute('data-flying') === 'true';
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Resume flight' })).toBeVisible();
    await resume(page);
    await expect(pill(page)).toHaveText(flying ? HOVER : GROUND);

    // The save moved to the free cursor (controls version 4) and on to version 5, which turns look acceleration, sustained
    // edges and edge rest on (turn-360, 2026-09-25). Written on pagehide.
    await page.reload(); await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1') || '{}'));
    expect(saved.trackpadSteering).toBe('free'); expect(saved.controlsVersion).toBe(5);
    expect(saved.sustainedEdges).toBe(true); expect(saved.lookAccel).toBe(true);
    expect(errors).toEqual([]);
  });
});

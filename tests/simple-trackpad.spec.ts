import { expect, test, type Page } from '@playwright/test';
const surface = (p: Page) => p.getByTestId('flight-surface');
const telemetry = (p: Page) => p.getByTestId('flight-telemetry');
const speed = async (p: Page) => Number(await telemetry(p).getAttribute('data-speed'));
const heading = async (p: Page) => Number(await telemetry(p).getAttribute('data-heading'));
const position = async (p: Page): Promise<number[]> => JSON.parse((await telemetry(p).getAttribute('data-position'))!);
const locked = (p: Page) => p.evaluate(() => !!document.pointerLockElement);
// With the blaster on the one-finger panel steps aside while a progressive controls hint shows (one message at a time).
const simpleShown = (p: Page) => expect(p.getByTestId('simple-trackpad-hud').or(p.getByTestId('controls-hint')).first()).toBeVisible();
async function begin(p: Page, url = '/') {
  await p.goto(url); await p.getByRole('button', { name: 'Begin expedition' }).click();
  await simpleShown(p);
}
for (const camera of ['third', 'first']) test(`one-finger look, keyboard motion and release-to-hover in ${camera} person`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(camera => localStorage.setItem('halaverga-flight-v1', JSON.stringify({ camera })), camera);
  await begin(page); await page.mouse.click(720, 450);
  await expect.poll(() => locked(page)).toBe(true);
  // Blaster on (the default): the capture click only frees the view; Space lifts into hover.
  await page.waitForTimeout(300); await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
  await page.keyboard.press('Space'); await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await expect.poll(() => speed(page)).toBeLessThan(.1);
  const before = await heading(page);
  await page.mouse.move(820, 450, { steps: 10 });
  await expect.poll(() => heading(page)).toBeLessThan(before - .2);
  await expect.poll(() => speed(page)).toBeLessThan(.1);
  await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(11);
  expect(await speed(page)).toBeLessThan(14);
  await page.keyboard.press('Shift'); await expect.poll(() => speed(page)).toBeGreaterThan(20);
  await page.keyboard.up('KeyW'); await expect.poll(() => speed(page)).toBeLessThan(.1);
  const hover = await position(page);
  await page.keyboard.down('KeyR'); await expect.poll(async () => (await position(page))[1]).toBeGreaterThan(hover[1] + 1);
  await page.keyboard.up('KeyR'); await expect.poll(() => speed(page)).toBeLessThan(.1);
  const high = await position(page);
  await page.keyboard.down('KeyF'); await expect.poll(async () => (await position(page))[1]).toBeLessThan(high[1] - 1);
  await page.keyboard.up('KeyF'); await expect.poll(() => speed(page)).toBeLessThan(.1);
  const side = await position(page);
  await page.keyboard.down('KeyD'); await expect.poll(async () => (await position(page))[0]).toBeGreaterThan(side[0] + 1);
  await page.keyboard.up('KeyD'); await expect.poll(() => speed(page)).toBeLessThan(.1);
  expect(errors).toEqual([]);
});
// Blaster off: PR #12's click brake. With the blaster on the locked click fires instead (tests/shooter-desktop.spec.ts).
test('blaster off: primary click brakes, releases the pointer and requires a fresh movement press', async ({ page }) => {
  await begin(page, '/?shooter=0'); await expect(page.getByTestId('simple-trackpad-hud')).toContainText('CLICK THE SCENE');
  await page.mouse.click(720, 450);
  await expect(page.getByTestId('simple-trackpad-hud')).toContainText('CLICK TO STOP + FREE POINTER');
  await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(8);
  await page.mouse.down(); await expect.poll(() => locked(page)).toBe(false); await page.mouse.up();
  await page.keyboard.down('KeyW'); // OS-style repeat from the still-held key.
  await expect.poll(() => speed(page)).toBeLessThan(.1);
  await expect(surface(page)).toHaveAttribute('data-trackpad-active', 'false');
  await expect(page.getByRole('button', { name: 'Resume flight' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByLabel('Trackpad steering')).toHaveValue('simple');
  await expect(page.getByLabel('Reverse scroll direction')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.keyboard.up('KeyW'); await page.mouse.click(720, 450);
  await expect.poll(() => speed(page)).toBeLessThan(.1);
  await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(8);
  await page.keyboard.up('KeyW');
});
test('scroll and inertia never propel; native pinch zoom stops and releases flight', async ({ page }) => {
  await begin(page); const ground = await position(page); await page.mouse.click(720, 450);
  await expect.poll(() => locked(page)).toBe(true); await page.keyboard.press('Space');
  await expect.poll(async () => (await position(page))[1]).toBeGreaterThan(ground[1] + 1);
  await expect.poll(() => speed(page)).toBeLessThan(.1);
  const prevented = await surface(page).evaluate(el => [{ deltaY: -500 }, { deltaY: 0, deltaX: 500 }, { deltaY: 500, momentum: true }].map(sample => {
    const e = new WheelEvent('wheel', { ...sample, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'momentum', { value: sample.momentum });
    el.dispatchEvent(e); return e.defaultPrevented;
  }));
  expect(prevented).toEqual([false, false, false]);
  await page.waitForTimeout(500); expect(await speed(page)).toBeLessThan(.1);
  await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(8);
  const zoomPrevented = await surface(page).evaluate(el => {
    const e = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(e); return e.defaultPrevented;
  });
  expect(zoomPrevented).toBe(false); await expect.poll(() => locked(page)).toBe(false);
  await expect.poll(() => speed(page)).toBeLessThan(.1); await page.keyboard.up('KeyW');
});
test('a press canceled by resize cannot engage on release', async ({ page }) => {
  await begin(page); await page.mouse.move(720, 450); await page.mouse.down();
  await page.setViewportSize({ width: 1300, height: 900 }); await page.mouse.up();
  await expect(surface(page)).toHaveAttribute('data-trackpad-active', 'false');
  expect(await locked(page)).toBe(false);
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
});
test('drag and capture rejection leave keyboard and drag-to-look available without launching', async ({ page }) => {
  await begin(page);
  await surface(page).evaluate(el => { el.requestPointerLock = () => Promise.reject(new Error('Unavailable')); });
  await page.mouse.click(720, 450);
  await expect(page.getByText('Pointer capture is unavailable.', { exact: false }).first()).toBeVisible();
  // Without the lock a click cannot fire, so the blaster's key is named; C fires unlocked.
  await expect(page.getByText('Hold C to fire.', { exact: false }).first()).toBeVisible();
  await page.keyboard.down('KeyC'); await expect.poll(async () => Number(await page.getByTestId('shooter-hud').getAttribute('data-shots'))).toBeGreaterThan(0);
  await page.keyboard.up('KeyC');
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
  const before = await heading(page);
  await page.mouse.down(); await page.mouse.move(820, 450, { steps: 10 }); await page.mouse.up();
  await expect.poll(() => heading(page)).toBeLessThan(before - .2);
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
  await page.keyboard.press('Space'); await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(8); await page.keyboard.up('KeyW');
});
for (const url of ['/', '/?shooter=0']) test(`Escape, focus loss and resize clear movement and never auto-capture (${url})`, async ({ page }) => {
  await begin(page, url);
  for (const interruption of ['escape', 'blur', 'resize']) {
    await page.mouse.click(720, 450); await page.keyboard.down('KeyW');
    await expect.poll(() => speed(page)).toBeGreaterThan(8);
    if (interruption === 'escape') await page.keyboard.press('Escape');
    else if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.setViewportSize({ width: 1300, height: 900 });
    await expect.poll(() => locked(page)).toBe(false); await page.keyboard.up('KeyW');
    if (interruption !== 'resize') await page.getByRole('button', { name: 'Resume flight' }).click();
    await expect(surface(page)).toHaveAttribute('data-trackpad-active', 'false');
    await expect.poll(() => speed(page)).toBeLessThan(.1);
  }
});
test('simple link overrides a saved Flow preference and saves the new selection', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('halaverga-flight-v1')) localStorage.setItem('halaverga-flight-v1', JSON.stringify({ trackpadSteering: 'flow', camera: 'first', reduced: true }));
  });
  await begin(page, '/?trackpad=simple');
  await expect(page.getByRole('dialog', { name: 'Find your flow' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByLabel('Trackpad steering')).toHaveValue('simple');
  await expect(page.getByRole('button', { name: 'First person', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Looking sensitivity').fill('1.4');
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await simpleShown(page);
});
test('an old saved free profile (the pre-version-2 default) opens in one finger + keyboard; an explicit v2 free stays', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('halaverga-flight-v1', JSON.stringify({ trackpadSteering: 'free', camera: 'first' })); }
  });
  await begin(page);
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByLabel('Trackpad steering')).toHaveValue('simple');
  await page.getByLabel('Trackpad steering').selectOption('free');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1')!))).toMatchObject({ trackpadSteering: 'free', controlsVersion: 3, camera: 'first' });
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByTestId('simple-trackpad-hud')).toHaveCount(0);
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByLabel('Trackpad steering')).toHaveValue('free');
});
for (const blaster of [true, false]) test(`on the ground after a pause, one click ${blaster ? 'restores free looking on the ground' : 'lifts into hover (PR #12)'}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const hud = page.getByTestId('simple-trackpad-hud'), shots = async () => Number(await page.getByTestId('shooter-hud').getAttribute('data-shots'));
  // The blaster panel's reminder appears once the progressive hints are done.
  if (blaster) await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('halaverga-flight-v1', JSON.stringify({ hintProgress: { touch: 0, simple: 4, mouse: 0 } })); }
  });
  await begin(page, blaster ? '/' : '/?shooter=0');
  await expect(hud).toContainText(blaster ? 'CLICK THE SCENE TO LOOK FREELY' : 'CLICK THE SCENE TO LIFT INTO HOVER');
  if (blaster) { await page.mouse.click(720, 450); await expect.poll(() => locked(page)).toBe(true); }
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
  await page.keyboard.press('Escape'); await expect.poll(() => locked(page)).toBe(false);
  await page.getByRole('button', { name: 'Resume flight' }).click();
  await expect(hud).toContainText(blaster ? 'CLICK THE SCENE TO LOOK FREELY' : 'CLICK THE SCENE TO LIFT INTO HOVER');
  await page.mouse.click(720, 450); await expect.poll(() => locked(page)).toBe(true);
  if (!blaster) { await expect(telemetry(page)).toHaveAttribute('data-flying', 'true'); expect(errors).toEqual([]); return; }
  await page.waitForTimeout(400);
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false'); expect(await shots()).toBe(0);
  const before = await heading(page); await page.mouse.move(820, 450, { steps: 10 });
  await expect.poll(() => heading(page)).toBeLessThan(before - .2);
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
  await page.keyboard.press('Space'); await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  expect(errors).toEqual([]);
});

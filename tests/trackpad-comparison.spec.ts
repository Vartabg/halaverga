import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const surface = (p: Page) => p.getByTestId('flight-surface');
const speed = async (p: Page) => Number(await p.getByTestId('flight-telemetry').getAttribute('data-speed'));
async function begin(page: Page, steering = 'captured', camera = 'third') {
  await page.addInitScript(({ steering, camera }) => {
    if (!localStorage.getItem('halaverga-flight-v1')) localStorage.setItem('halaverga-flight-v1', JSON.stringify({ trackpadSteering: steering, camera, controlsVersion: 2 }));
  }, { steering, camera });
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
}
for (const camera of ['first', 'third']) test(`captured trackpad cruises, steers, scrolls and releases without a keyboard in ${camera} person`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await begin(page, 'captured', camera); await page.mouse.click(720, 500);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.getAttribute('data-testid'))).toBe('flight-surface');
  await expect(surface(page)).toHaveAttribute('data-trackpad-active', 'true');
  await expect.poll(() => speed(page)).toBeGreaterThan(7);
  const initial = Number(await page.getByTestId('flight-telemetry').getAttribute('data-heading'));
  await page.mouse.move(820, 500, { steps: 10 });
  await expect.poll(async () => Number(await page.getByTestId('flight-telemetry').getAttribute('data-heading'))).toBeLessThan(initial - .2);
  await page.mouse.wheel(0, -100); await expect.poll(() => speed(page)).toBeGreaterThan(10);
  await page.mouse.down(); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(surface(page)).toHaveAttribute('data-trackpad-active', 'false');
  await expect.poll(() => speed(page)).toBeLessThan(.3);
  await expect(page.getByRole('button', { name: 'Resume flight' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByLabel('Trackpad steering')).toHaveValue('captured');
  await page.getByLabel('Trackpad steering').selectOption('free');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.mouse.click(720, 500); await expect.poll(() => speed(page)).toBeGreaterThan(7);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  expect(errors).toEqual([]);
});
test('momentum is ignored and recent edge turns stop; classic and reverse settings persist', async ({ page }) => {
  await begin(page, 'free'); await page.mouse.click(720, 500); await expect.poll(() => speed(page)).toBeGreaterThan(7);
  await surface(page).evaluate(el => {
    const e = new WheelEvent('wheel', { deltaY: -500, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'momentum', { value: true }); el.dispatchEvent(e);
  });
  await page.waitForTimeout(600); expect(await speed(page)).toBeLessThan(8.3);
  await page.mouse.move(1430, 500, { steps: 10 }); await page.waitForTimeout(600);
  const heading = await page.getByTestId('flight-telemetry').getAttribute('data-heading');
  await page.waitForTimeout(700); expect(await page.getByTestId('flight-telemetry').getAttribute('data-heading')).toBe(heading);
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByLabel('Expressive hero poses').uncheck(); await page.getByLabel('Reverse scroll direction').check();
  await page.getByLabel('Starting cruise speed (m/s)').fill('12');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.mouse.click(720, 500); await expect.poll(() => speed(page)).toBeGreaterThan(11);
  await page.mouse.wheel(0, -80); await expect.poll(() => speed(page)).toBeLessThan(10);
  await page.reload(); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByLabel('Expressive hero poses')).not.toBeChecked();
  await expect(page.getByLabel('Reverse scroll direction')).toBeChecked();
  await expect(page.getByLabel('Starting cruise speed (m/s)')).toHaveValue('12');
});
test('capture rejection provides free steering and an unexpected capture loss pauses', async ({ page }) => {
  await begin(page); await page.evaluate(() => { const el = document.querySelector<HTMLElement>('[data-testid="flight-surface"]')!; el.requestPointerLock = () => Promise.reject(new Error('Unavailable')); });
  await page.mouse.click(720, 500);
  await expect(page.getByText('Captured steering is unavailable.', { exact: false }).first()).toBeVisible();
  await page.mouse.click(720, 500); await expect.poll(() => speed(page)).toBeGreaterThan(7);
  await page.getByRole('button', { name: 'Flight settings' }).click(); await page.getByLabel('Trackpad steering').selectOption('captured');
  await page.getByRole('button', { name: 'Close dialog' }).click(); await page.mouse.click(720, 500);
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(true);
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByRole('button', { name: 'Resume flight' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume flight' }).click();
  await expect(surface(page)).toHaveAttribute('data-trackpad-active', 'false');
});
test('a delayed capture grant after pausing cannot restart flight', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => {
    let locked: Element | null = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
    document.exitPointerLock = () => { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
    document.querySelector<HTMLElement>('[data-testid="flight-surface"]')!.requestPointerLock = function () {
      const element = this;
      return new Promise<void>(resolve => window.addEventListener('test-grant-capture', () => {
        locked = element; document.dispatchEvent(new Event('pointerlockchange')); resolve();
      }, { once: true }));
    };
  });
  await page.mouse.click(720, 500); await page.getByRole('button', { name: 'Pause expedition' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('test-grant-capture')));
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.getByRole('button', { name: 'Resume flight' }).click();
  await expect(surface(page)).toHaveAttribute('data-trackpad-active', 'false');
});
test('local recording exports input and captured zoom releases without consuming browser zoom', async ({ page }) => {
  await begin(page); await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByText('Local gesture recording', { exact: true }).click();
  await page.getByRole('button', { name: 'Start a new gesture recording' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.mouse.click(720, 500); await expect.poll(() => speed(page)).toBeGreaterThan(7);
  await page.mouse.wheel(0, -40); await expect.poll(() => speed(page)).toBeGreaterThan(8.5);
  const prevented = await surface(page).evaluate(el => {
    const e = new WheelEvent('wheel', { deltaY: -80, ctrlKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(e); return e.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(surface(page)).toHaveAttribute('data-trackpad-active', 'false');
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByText('Local gesture recording', { exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording gestures' }).click();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download gesture recording' }).click();
  const download = await pending, content = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(content.rows.map((row: { event: string }) => row.event)).toEqual(expect.arrayContaining(['wheel', 'zoom', 'pause']));
  expect(content.settings.steering).toBe('captured'); expect(content.rows.length).toBeLessThanOrEqual(6000);
});

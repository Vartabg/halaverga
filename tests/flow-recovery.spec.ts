import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { beginFlow, hud, selected, speed, wheel } from './flow-browser';
for (const interruption of ['Escape', 'blur', 'zoom', 'gesturestart', 'resize', 'lockloss']) test(`Flow neutralizes ${interruption} and never recaptures automatically`, async ({ page }) => {
  await beginFlow(page); await wheel(page, -160, false); await expect.poll(() => speed(page)).toBeGreaterThan(2);
  if (interruption === 'Escape') await page.keyboard.press('Escape');
  else if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  else if (interruption === 'resize') await page.setViewportSize({ width: 1300, height: 900 });
  else if (interruption === 'lockloss') await page.evaluate(() => document.exitPointerLock());
  else if (interruption === 'gesturestart') await page.getByTestId('flight-surface').evaluate(el => el.dispatchEvent(new Event('gesturestart')));
  else {
    const prevented = await page.getByTestId('flight-surface').evaluate(el => {
      const e = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true, bubbles: true }); el.dispatchEvent(e); return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
  }
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  const resume = page.getByRole('button', { name: 'Resume flight' }); if (await resume.isVisible()) await resume.click();
  await expect(hud(page)).toHaveAttribute('data-capture', 'idle');
  await wheel(page, -160, false); expect(await selected(page)).toBe(0);
  await expect.poll(() => speed(page)).toBeLessThan(.1);
});
test('a canceled pending request cannot capture or launch after pause', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('halaverga-flight-v1', JSON.stringify({ flowIntroSeen: true }));
    const original = Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock = function(options) {
      return new Promise<void>((resolve, reject) => setTimeout(() => { Promise.resolve(original.call(this, options)).then(resolve, reject); }, 200));
    };
  });
  await page.goto('/?trackpad=flow'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.mouse.click(720, 500); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume flight' })).toBeVisible();
  await page.waitForTimeout(500); expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.getByRole('button', { name: 'Resume flight' }).click(); await expect(hud(page)).toHaveAttribute('data-capture', 'idle');
  expect(await selected(page)).toBe(0);
});
test('an interrupted uncompleted press cannot engage when released', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('halaverga-flight-v1', JSON.stringify({ flowIntroSeen: true })));
  await page.goto('/?trackpad=flow'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.mouse.move(720, 500); await page.mouse.down(); await page.setViewportSize({ width: 1300, height: 900 }); await page.mouse.up();
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  const resume = page.getByRole('button', { name: 'Resume flight' }); if (await resume.isVisible()) await resume.click();
  await expect(hud(page)).toHaveAttribute('data-capture', 'idle');
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
});
test('capture rejection offers classic free cursor without launching', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('halaverga-flight-v1', JSON.stringify({ flowIntroSeen: true }));
    Element.prototype.requestPointerLock = () => Promise.reject(new Error('test rejection'));
  });
  await page.goto('/?trackpad=flow'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.mouse.click(720, 500);
  await expect(page.getByText('Flow could not capture the pointer.', { exact: false }).first()).toBeVisible();
  await expect.poll(() => speed(page)).toBeLessThan(.1);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(hud(page)).toHaveAttribute('data-capture', 'idle');
  await page.getByRole('button', { name: 'Use free cursor controls' }).click();
  await expect(hud(page)).not.toBeVisible();
});
test('a deliberate retry after capture rejection enters hover and clears the failure', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('halaverga-flight-v1', JSON.stringify({ flowIntroSeen: true }));
    const original = Element.prototype.requestPointerLock; let first = true;
    Element.prototype.requestPointerLock = function(options) {
      if (first) { first = false; return Promise.reject(new Error('test rejection')); }
      return original.call(this, options);
    };
  });
  await page.goto('/?trackpad=flow'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.mouse.click(720, 500); await expect(page.getByRole('button', { name: 'Use free cursor controls' })).toBeVisible();
  await page.mouse.click(720, 500); await expect(hud(page)).toHaveAttribute('data-capture', 'engaged');
  await expect(page.getByRole('button', { name: 'Use free cursor controls' })).not.toBeVisible();
  await expect(page.getByText('Flow could not capture the pointer.', { exact: false })).toHaveCount(0);
  expect(await selected(page)).toBe(0);
});
test('Flow graphics recovery returns with no capture or selected speed', async ({ page }) => {
  await beginFlow(page); await wheel(page, -160, false); await expect.poll(() => speed(page)).toBeGreaterThan(2);
  await page.evaluate(() => document.querySelector('canvas')?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext());
  await expect(page.getByRole('heading', { name: 'The world needs a moment.' })).toBeVisible();
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.getByRole('button', { name: 'Reload scene' }).click();
  await page.getByRole('button', { name: 'Resume flight' }).click();
  await expect(hud(page)).toHaveAttribute('data-capture', 'idle');
  await wheel(page, -160, false); expect(await selected(page)).toBe(0);
  await expect.poll(() => speed(page)).toBeLessThan(.1);
});
test('Flow introduction calibrates, persists sensitivity, starts guided practice, and remains accessible', async ({ page }) => {
  await page.goto('/?trackpad=flow'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByRole('dialog', { name: 'Find your flow' })).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Looking sensitivity', exact: false }); await slider.fill('1.4');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Check scroll direction' }).click();
  await page.getByLabel('Scroll direction practice area').hover(); await page.mouse.wheel(0, 50);
  await page.getByRole('button', { name: 'Use this direction & practice' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.mouse.click(720, 500); await expect(hud(page)).toHaveAttribute('data-capture', 'engaged');
  await page.mouse.move(800, 500, { steps: 10 }); await expect(hud(page)).toContainText('Stroke forward');
  await page.mouse.wheel(0, 80); await expect.poll(() => speed(page)).toBeGreaterThan(.5);
  await expect(hud(page)).toContainText('Press once'); await page.mouse.click(800, 500);
  await expect(hud(page)).toContainText('That’s Flow');
  await page.keyboard.press('Escape'); await page.reload(); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByRole('slider', { name: 'Looking sensitivity', exact: false })).toHaveValue('1.4');
  await expect(page.getByLabel('Reverse scroll direction')).toBeChecked();
});
